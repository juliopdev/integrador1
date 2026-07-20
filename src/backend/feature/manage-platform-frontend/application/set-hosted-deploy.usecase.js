import { NotFoundError, AppError, DomainError } from '../../../common/errors.js';
import { uuidv7 } from '../../../common/id.js';

/**
 * Despliega un frontend hospedado para un tenant. Recibe el buffer del archivo comprimido
 * (`.rar` o `.zip`), lo extrae, valida que contenga `index.html`, inyecta las variables de
 * entorno como bloque `<script>` y persiste el deploy como `mode='hosted'`.
 *
 * @param {{ deployRepository: object, tenantRepository: object, fsAdapter: object, frontendsDir: string, invalidateSubdomainCache?: (subdomain: string) => Promise<void>, now?: () => number }} deps
 * @returns {(params: { tenantId: string, buffer: Buffer, filename: string, envVarsText?: string }) => Promise<{tenantId: string, mode: string, envVars: Object, extractedPath: string, status: string, updatedAt: number}>} Función de caso de uso.
 */
export function makeSetHostedDeploy({ deployRepository, tenantRepository, fsAdapter, frontendsDir, invalidateSubdomainCache = async () => {}, now = () => Date.now() }) {
  /**
   * Despliega un frontend hospedado: extrae el archivo, valida index.html, inyecta env vars y persiste.
   * @param {Object} params
   * @param {string} params.tenantId - ID del tenant.
   * @param {Buffer} params.buffer - Buffer del archivo comprimido.
   * @param {string} params.filename - Nombre del archivo (.zip o .rar).
   * @param {string} [params.envVarsText] - Texto KEY=VALUE de variables de entorno.
   * @returns {Promise<{tenantId: string, mode: string, envVars: Object, extractedPath: string, status: string, updatedAt: number}>}
   * @throws {NotFoundError} TENANT_NOT_FOUND
   * @throws {AppError} INVALID_FILE_TYPE | MISSING_INDEX_HTML | EXTRACTION_FAILED
   * @throws {DomainError} SECRET_IN_FRONTEND
   */
  return async function setHostedDeploy({ tenantId, buffer, filename, envVarsText }) {
    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe o fue eliminado.');

    const ext = fsAdapter.extname(filename).toLowerCase();
    if (ext !== '.rar' && ext !== '.zip') {
      throw new AppError(400, 'INVALID_FILE_TYPE', 'Solo se aceptan archivos .rar o .zip.');
    }

    // Directorios de trabajo.
    const tenantDir = fsAdapter.join(frontendsDir, tenantId);
    const tmpDir = fsAdapter.join(frontendsDir, `_tmp_${tenantId}_${Date.now()}`);
    fsAdapter.ensureDir(tmpDir);

    const archivePath = fsAdapter.join(tmpDir, `archive${ext}`);
    fsAdapter.writeFile(archivePath, buffer);

    try {
      // Extraer el archivo.
      const extractDir = fsAdapter.join(tmpDir, 'out');
      fsAdapter.ensureDir(extractDir);

      if (ext === '.rar') {
        await extractRar(archivePath, extractDir, fsAdapter);
      } else {
        extractZip(archivePath, extractDir, fsAdapter);
      }

      // Buscar index.html — puede estar en la raíz del zip o dentro de una subcarpeta única.
      const indexRoot = findIndexRoot(extractDir, fsAdapter);
      if (!indexRoot) {
        throw new AppError(400, 'MISSING_INDEX_HTML', 'El archivo comprimido debe contener un index.html en la raíz.');
      }

      // Parsear variables de entorno.
      const envVars = parseEnvVars(envVarsText || '');

      // Inyectar variables de entorno en index.html.
      if (Object.keys(envVars).length > 0) {
        injectEnvVars(fsAdapter.join(indexRoot, 'index.html'), envVars, fsAdapter);
      }

      // Mover al directorio definitivo del tenant (reemplaza anterior si existe).
      if (fsAdapter.exists(tenantDir)) fsAdapter.remove(tenantDir);
      fsAdapter.ensureDir(tenantDir);
      copyDirContents(indexRoot, tenantDir, fsAdapter);

      // Persistir deploy.
      const deployId = uuidv7();
      const ts = now();
      deployRepository.upsert({
        id: deployId,
        tenantId,
        mode: 'hosted',
        externalUrl: null,
        envVarsJson: JSON.stringify(envVars),
        extractedPath: tenantDir,
        status: 'active',
        now: ts,
      });

      // Invalida la resolución cacheada del subdominio para que el `tenant-loader` sirva ya el nuevo
      // frontend hospedado (extractedPath/mode) sin esperar el TTL (60s).
      try { await invalidateSubdomainCache(tenant.subdomain); } catch { /* el TTL lo cubre */ }

      return {
        tenantId,
        mode: 'hosted',
        envVars,
        extractedPath: tenantDir,
        status: 'active',
        updatedAt: ts,
      };
    } finally {
      // Limpiar temporal.
      if (fsAdapter.exists(tmpDir)) fsAdapter.remove(tmpDir);
    }
  };
}

/**
 * Extrae un archivo RAR usando node-unrar-js (pure JS/Wasm).
 * @param {string} archivePath - Ruta al archivo .rar.
 * @param {string} destDir - Directorio de destino.
 * @param {Object} fsAdapter - Adaptador de filesystem.
 * @returns {Promise<void>}
 */
async function extractRar(archivePath, destDir, fsAdapter) {
  const { createExtractorFromFile } = await import('node-unrar-js');
  const extractor = await createExtractorFromFile({ filepath: archivePath, targetPath: destDir });
  const { files } = extractor.extract();
  // Forzar la iteración del generador para que la extracción se complete.
  // eslint-disable-next-line no-unused-vars
  for (const _ of files) { /* noop — iterate to extract */ }
}

/**
 * Extrae un archivo ZIP usando tar.exe (Windows) o unzip (Linux).
 * @param {string} archivePath - Ruta al archivo .zip.
 * @param {string} destDir - Directorio de destino.
 * @param {Object} fsAdapter - Adaptador de filesystem.
 * @throws {AppError} EXTRACTION_FAILED
 */
function extractZip(archivePath, destDir, fsAdapter) {
  try {
    if (process.platform === 'win32') {
      fsAdapter.execFile('tar', ['-xf', archivePath], { cwd: destDir });
    } else {
      fsAdapter.execFile('unzip', ['-o', archivePath, '-d', destDir]);
    }
  } catch (err) {
    throw new AppError(400, 'EXTRACTION_FAILED', `No se pudo extraer el archivo: ${err.message}`);
  }
}

/**
 * Busca el directorio raíz que contiene index.html. Si el zip tiene una subcarpeta única, baja.
 * @param {string} dir - Directorio donde buscar.
 * @param {Object} fsAdapter - Adaptador de filesystem.
 * @returns {string|null} Ruta del directorio con index.html, o null si no se encuentra.
 */
function findIndexRoot(dir, fsAdapter) {
  if (fsAdapter.exists(fsAdapter.join(dir, 'index.html'))) return dir;
  // Una sola subcarpeta → probablemente el builder empaquetó dentro de `dist/` o `build/`.
  const entries = fsAdapter.listDir(dir).filter((e) => fsAdapter.isDir(fsAdapter.join(dir, e)));
  if (entries.length === 1) {
    const sub = fsAdapter.join(dir, entries[0]);
    if (fsAdapter.exists(fsAdapter.join(sub, 'index.html'))) return sub;
  }
  return null;
}

/**
 * Parsea texto KEY=VALUE (uno por línea) a objeto plano. Ignora líneas vacías y comentarios.
 * Aplica assertNoSecrets al resultado.
 * @param {string} text - Texto con variables de entorno.
 * @returns {Object<string, string>} Objeto clave-valor.
 * @throws {DomainError} SECRET_IN_FRONTEND si detecta credenciales.
 */
function parseEnvVars(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    vars[key] = value;
  }
  assertNoSecrets(vars);
  return vars;
}

/**
 * Detecta keys/values que parecen secretos y lanza `DomainError` (`SECRET_IN_FRONTEND`).
 *
 * Los envVars se inyectan al HTML como `window.env = {...}` — visible para cualquier cliente
 * del frontend. Un secret ahí = compromiso inmediato. En vez de un warning tibio que el operador
 * puede ignorar, el server rechaza con error explícito e instrucciones.
 *
 * Reglas:
 * 1. Keys con nombres reveladores: `SECRET`, `PRIVATE`, `PASSWORD`, `PASSPHRASE`, `SIGNING`,
 *    `AUTH_TOKEN`, `ACCESS_KEY`. Case-insensitive.
 * 2. Valores con prefijos conocidos de secretos: Stripe `sk_*`/`rk_*`/`whsec_*`, GitHub PAT
 *    (`ghp_`, `gho_`, `ghs_`, `ghr_`), Slack (`xox[bpaers]-`). Lista blanca conservadora — no
 *    marcamos secreto por longitud/entropía (falsos positivos rompen configs válidas).
 *
 * Cuando algo se rechaza, el mensaje indica en qué línea + qué usar en su lugar (patrón BFF).
 */
const SECRET_KEY_PATTERNS = [
  /SECRET/i, /PRIVATE/i, /PASSWORD/i, /PASSPHRASE/i, /SIGNING/i,
  /AUTH_TOKEN/i, /ACCESS_KEY/i,
];
const SECRET_VALUE_PATTERNS = [
  /^sk_(live|test)_/i,   // Stripe secret key
  /^rk_(live|test)_/i,   // Stripe restricted key
  /^whsec_/i,            // Stripe webhook signing secret
  /^gh[pors]_[a-z0-9]/i, // GitHub personal access tokens (ghp/gho/ghr/ghs)
  /^xox[baprs]-/i,       // Slack tokens
  // URI con credenciales embebidas (ej. `postgres://user:pass@host/db`, `mongodb+srv://…`).
  // Cualquier scheme://algo:algo@ es sospechoso: sea `postgres`, `mongodb`, `redis`, `mysql`,
  // `amqp`, `smtp`, etc. — todos exponen usuario y password en texto plano.
  /^[a-z][a-z0-9+.-]*:\/\/[^:@\s/]+:[^@\s]+@/i,
];

/**
 * Detecta keys/values que parecen secretos y lanza DomainError.
 * @param {Object<string, string>} vars - Variables a inspeccionar.
 * @throws {DomainError} SECRET_IN_FRONTEND si se detecta un secreto.
 */
function assertNoSecrets(vars) {
  for (const [key, value] of Object.entries(vars)) {
    for (const pat of SECRET_KEY_PATTERNS) {
      if (pat.test(key)) {
        throw new DomainError(
          'SECRET_IN_FRONTEND',
          `La variable "${key}" parece un secreto por su nombre. window.env es público — no pongas credenciales sensibles ahí. Guardá el secret en Proveedores (paso 2 del backend) y expone una API en tu contrato que tu frontend consuma en su lugar.`,
        );
      }
    }
    for (const pat of SECRET_VALUE_PATTERNS) {
      if (pat.test(value)) {
        throw new DomainError(
          'SECRET_IN_FRONTEND',
          `El valor de "${key}" parece un secreto de proveedor externo (Stripe/GitHub/Slack). window.env se sirve en el HTML crudo — cualquier cliente puede leerlo. Movelo a Proveedores (paso 2 del backend) y creá un endpoint proxy en tu contrato.`,
        );
      }
    }
  }
}

/**
 * Inyecta bloque `<script>window.env = {...};</script>` al inicio del `<head>` del HTML.
 * @param {string} htmlPath - Ruta al archivo index.html.
 * @param {Object<string, string>} envVars - Variables de entorno a inyectar.
 * @param {Object} fsAdapter - Adaptador de filesystem.
 */
function injectEnvVars(htmlPath, envVars, fsAdapter) {
  let html = fsAdapter.readFile(htmlPath, 'utf-8');
  const script = `<script>window.env = ${JSON.stringify(envVars)}; window.__ENV__ = { ...window.__ENV__, ...${JSON.stringify(envVars)} };</script>`;
  // Inyectar justo después de <head> (o al inicio si no hay <head>).
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n    ${script}`);
  } else if (html.includes('<HEAD>')) {
    html = html.replace('<HEAD>', `<HEAD>\n    ${script}`);
  } else {
    html = `${script}\n${html}`;
  }
  fsAdapter.writeFile(htmlPath, html, 'utf-8');
}

/**
 * Copia recursivamente el contenido de un directorio a otro.
 * @param {string} src - Directorio origen.
 * @param {string} dest - Directorio destino.
 * @param {Object} fsAdapter - Adaptador de filesystem.
 */
function copyDirContents(src, dest, fsAdapter) {
  for (const entry of fsAdapter.listDir(src)) {
    const srcPath = fsAdapter.join(src, entry);
    const destPath = fsAdapter.join(dest, entry);
    if (fsAdapter.isDir(srcPath)) {
      fsAdapter.ensureDir(destPath);
      copyDirContents(srcPath, destPath, fsAdapter);
    } else {
      fsAdapter.copyFile(srcPath, destPath);
    }
  }
}
