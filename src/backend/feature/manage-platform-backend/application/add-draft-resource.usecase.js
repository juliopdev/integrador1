import { DomainError } from '../../../common/errors.js';

// Regex snake_case compartido con `contract.schema` (dominio). No lo importamos para no crear una
// dependencia inversa del use case en el schema Zod completo; el chequeo mínimo aquí es solo el
// gate del asistente antes de meter algo al draft. La validación estricta del contrato entero
// ocurre en `publish-contract.usecase` al momento de publicar.
const IDENT = /^[a-z][a-z0-9_]*$/;
const VALID_STORES = new Set(['sql', 'nosql']);

/**
 * Agrega un resource al **draft** del contrato del asistente No-Code (paso `_step-manage-api`).
 * Si aún no hay draft, lo inicializa con `nextVersion` (v1 sin publicado previo, `v(N+1)` si hay
 * un publicado v N).  Estructura del draft = misma forma del contrato final para que el
 * `_step-finish` pueda pre-poblarlo sin transformación adicional.
 *
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { name: string, physicalName?: string, store: string, endpoint?: Object, manageable?: boolean }) => Promise<{version: string, resources: string[]}>} Función de caso de uso.
 * @throws {DomainError} `INVALID_NAME` | `INVALID_STORE` | `DUPLICATE_RESOURCE`
 */
// Métodos HTTP soportados (whitelist local para no acoplar acá al enum del schema Zod).
const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

/**
 * Deriva el shape efectivo del endpoint a partir del override opcional del form. Cuando el
 * operador no manda nada (llamados legacy / API programático), sirve el default histórico:
 * los 4 verbos habilitados con permisos sanos por defecto. Cuando SÍ manda, la config del form
 * gana en cada campo. Es un merge shallow con validación de contenido.
 */
/**
 * Deriva el shape efectivo del endpoint a partir del override opcional del form.
 * @param {string} name - Nombre del resource (para path default).
 * @param {Object} [override] - Override del endpoint desde el form.
 * @param {string} [override.path] - Ruta custom.
 * @param {string[]} [override.methods] - Métodos custom.
 * @param {Object} [override.access] - Matriz de acceso custom.
 * @returns {{ path: string, resource: string, methods: string[], access: Object }} Endpoint resuelto.
 */
function resolveEndpoint(name, override) {
  const path = (override?.path && String(override.path).trim()) || `/${name}`;
  const methods = Array.isArray(override?.methods) && override.methods.length
    ? [...new Set(override.methods.map((m) => String(m).toUpperCase()).filter((m) => VALID_METHODS.has(m)))]
    : ['GET', 'POST', 'PUT', 'DELETE'];

  const defaultAccess = {
    GET: ['master', 'user'],
    POST: ['master'],
    PUT: ['master'],
    DELETE: ['master'],
  };
  const access = {};
  for (const m of methods) {
    const roles = override?.access?.[m];
    if (Array.isArray(roles) && roles.length) {
      access[m] = [...new Set(roles.map((r) => String(r)).filter(Boolean))];
    } else {
      access[m] = defaultAccess[m] || ['master'];
    }
  }

  return { path, resource: name, methods, access };
}

export function makeAddDraftResource({ contractRepository, now = () => Date.now() }) {
  /**
   * Agrega un resource al draft del contrato del asistente No-Code.
   * @param {Object} params
   * @param {string} params.name - Nombre lógico del resource (snake_case).
   * @param {string} [params.physicalName] - Nombre físico de la tabla (derivado si omite).
   * @param {string} params.store - Tipo de store ("sql" | "nosql").
   * @param {Object} [params.endpoint] - Config del endpoint auto-generado.
   * @param {boolean} [params.manageable] - Si el resource es gestionable desde la UI.
   * @returns {Promise<{version: string, resources: string[]}>} Versión del draft + lista de resources.
   * @throws {DomainError} INVALID_NAME | INVALID_STORE | DUPLICATE_RESOURCE | INVALID_PATH | INVALID_METHODS
   */
  return async function addDraftResource({ name, physicalName, store, endpoint, manageable }) {
    // P6c: naming derivado — sin physicalName explícito se usa la convención `<lógico>_db`.
    const physical = physicalName || (IDENT.test(String(name ?? '')) ? `${name}_db` : physicalName);
    if (!IDENT.test(String(name ?? '')) || !IDENT.test(String(physical ?? ''))) {
      throw new DomainError('INVALID_NAME', 'name y physicalName deben ser snake_case.');
    }
    if (!VALID_STORES.has(store)) {
      throw new DomainError('INVALID_STORE', 'store debe ser "sql" o "nosql".');
    }

    // Punto de partida: draft actual (si existe) o esqueleto derivado del publicado.
    let draftSchema = contractRepository.getDraft()?.schema;
    let version;
    if (draftSchema) {
      version = draftSchema.version;
    } else {
      const published = contractRepository.getActiveContract();
      version = nextVersion(published?.version);
      draftSchema = emptyContract(version);
    }

    if ((draftSchema.resources || []).some((r) => r.name === name)) {
      throw new DomainError('DUPLICATE_RESOURCE', `El draft ya tiene un resource "${name}".`);
    }

    // Iter UX P4.1: el endpoint auto-generado ahora respeta el override del form. Si el form
    // manda `endpoint.path/methods/access`, esos ganan; si no, cae al default histórico.
    // Retrocompat: llamados sin `endpoint` (tests unit + API programático) siguen creando el
    // endpoint default automáticamente — no rompe nada existente.
    const resolvedEndpoint = resolveEndpoint(name, endpoint);
    if (!resolvedEndpoint.path.startsWith('/')) {
      throw new DomainError('INVALID_PATH', 'El path del endpoint debe empezar con "/".');
    }
    if (resolvedEndpoint.methods.length === 0) {
      throw new DomainError('INVALID_METHODS', 'Elegí al menos un método HTTP para el endpoint.');
    }

    const nextEndpoints = [...(draftSchema.endpoints || [])];
    if (nextEndpoints.some((e) => e.path === resolvedEndpoint.path)) {
      throw new DomainError('DUPLICATE_ENDPOINT', `Ya hay un endpoint en el path "${resolvedEndpoint.path}".`);
    }
    nextEndpoints.push(resolvedEndpoint);

    const nextSchema = {
      ...draftSchema,
      resources: [
        ...(draftSchema.resources || []),
        {
          name,
          physicalName: physical,
          store,
          fields: [],
          manageable: manageable !== false,
        }
      ],
      endpoints: nextEndpoints,
    };
    contractRepository.saveDraft({
      version,
      schemaJson: JSON.stringify(nextSchema),
      now: now(),
    });

    return { version, resources: nextSchema.resources.map((r) => r.name) };
  };
}

/**
 * Calcula la siguiente versión a partir de la actual.
 * @param {string|undefined|null} currentVersion - Versión actual (ej. "v3").
 * @returns {string} Siguiente versión (ej. "v4").
 */
function nextVersion(currentVersion) {
  if (!currentVersion) return 'v1';
  const n = Number(String(currentVersion).replace(/^v/, '')) || 0;
  return `v${n + 1}`;
}

/**
 * Crea un contrato vacío con la estructura mínima para un draft inicial.
 * @param {string} version - Versión del contrato (ej. "v1").
 * @returns {{ version: string, stores: Object, resources: Array, endpoints: Array, auth: Object, websocket: Object }} Contrato vacío con stores, resources, endpoints, auth y websocket.
 */
function emptyContract(version) {
  return {
    version,
    stores: { sql: { provider: 'neon', enabled: true } },
    resources: [],
    endpoints: [],
    auth: { userAuthEnabled: false, strategies: [], redirectUris: [] },
    websocket: { channels: [] },
  };
}
