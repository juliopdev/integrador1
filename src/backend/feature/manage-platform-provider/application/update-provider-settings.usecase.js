import { DomainError, NotFoundError } from '../../../common/errors.js';
import { findProvider } from '../../../infrastructure/providers/registry.js';

/**
 * Fábrica para el caso de uso P8.4b: Actualiza el `settings_json` de un provider ya linkeado.
 * Los settings son POLÍTICAS del Master (toggles.userAuth, toggles.userSupport, futuros...),
 * NO credenciales. Se guardan en claro.
 *
 * Validación: cada key del payload debe existir en `desc.settings.fields` del registry — evita
 * que un caller inyecte keys arbitrarias que después son ignoradas (fail-loud). Los tipos se
 * validan según `field.type` (por ahora sólo `checkbox` → boolean).
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.providerRepository - Repositorio de proveedores del tenant.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(params: { category: string, provider: string, settings: object }) =>
 *   Promise<{ category: string, provider: string, settings: object }>}
 * @throws {NotFoundError} `PROVIDER_NOT_LINKED` — si el proveedor no está linkeado.
 * @throws {DomainError} `INVALID_SETTINGS_KEY` — si alguna clave no está declarada en el registry.
 * @throws {DomainError} `INVALID_SETTINGS_TYPE` — si el tipo del valor no coincide con el esperado.
 */
export function makeUpdateProviderSettings({ providerRepository, now = () => Date.now() }) {
  /**
   * Actualiza la configuración de políticas (settings) de un proveedor linkeado.
   * @param {Object} params - Parámetros de actualización.
   * @param {string} params.category - Categoría del proveedor.
   * @param {string} params.provider - Nombre del proveedor.
   * @param {object} params.settings - Mapa de settings a actualizar (ej. `{ toggles: { userAuth: true } }`).
   * @returns {Promise<{ category: string, provider: string, settings: object }>}
   * @throws {NotFoundError} `PROVIDER_NOT_LINKED`
   * @throws {DomainError} `INVALID_SETTINGS_KEY`
   * @throws {DomainError} `INVALID_SETTINGS_TYPE`
   */
  return async function updateProviderSettings({ category, provider, settings }) {
    const desc = findProvider({ category, provider });
    if (!desc) {
      throw new NotFoundError('PROVIDER_UNKNOWN', 'Provider desconocido en el registry.');
    }
    const allowedFields = desc.settings?.fields ?? [];
    const allowedByPath = new Map(allowedFields.map((f) => [f.name, f]));

    // Aplanamos el payload y las fields del registry a paths (`toggles.userAuth`) para comparar.
    // Los forms SSR mandan `'true'/'false'` (strings) o `['false','true']` (array por hidden-twin
    // pattern con checkbox); coercionamos según el tipo declarado en el field.
    const payloadPaths = flattenToPaths(settings);
    const coerced = {};

    for (const [path, rawValue] of payloadPaths) {
      const field = allowedByPath.get(path);
      if (!field) {
        throw new DomainError('INVALID_SETTINGS_KEY', `El setting "${path}" no está declarado para ${category}/${provider}.`);
      }
      const value = field.type === 'checkbox' ? coerceCheckbox(rawValue) : rawValue;
      if (field.type === 'checkbox' && typeof value !== 'boolean') {
        throw new DomainError('INVALID_SETTINGS_TYPE', `El setting "${path}" espera boolean, recibió ${typeof rawValue}.`);
      }
      writePath(coerced, path, value);
    }

    const { updated } = providerRepository.updateSettings({
      category, provider,
      settingsJson: JSON.stringify(coerced),
      now: now(),
    });
    if (!updated) {
      throw new NotFoundError('PROVIDER_NOT_LINKED', 'El provider no está linkeado al tenant.');
    }
    return { category, provider, settings };
  };
}

/**
 * Aplana un objeto anidado `{ toggles: { userAuth: true } }` a un array de pares
 * `[['toggles.userAuth', true]]`. Los arrays se dejan pasar como valor único — el caller
 * (`coerceCheckbox`) decide qué hacer con ellos.
 * @param {object} obj - Objeto a aplanar.
 * @param {string} [prefix=''] - Prefijo de ruta para recursión interna.
 * @returns {Array<[string, *]>} Array de pares [ruta, valor].
 * @example
 * flattenToPaths({ a: { b: 1 } }) // [['a.b', 1]]
 */
function flattenToPaths(obj, prefix = '') {
  const out = [];
  if (obj == null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenToPaths(v, path));
    } else {
      out.push([path, v]);
    }
  }
  return out;
}

/**
 * Inverso de flattenToPaths — escribe `value` en el path indicado creando objetos intermedios.
 * @param {object} target - Objeto destino (se muta).
 * @param {string} path - Ruta separada por puntos (ej. `toggles.userAuth`).
 * @param {*} value - Valor a asignar en la ruta.
 */
function writePath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

/**
 * Coerciona el input del checkbox al boolean real. Tres formas legales de llegada:
 *   - `true`/`false` (JSON API-style)
 *   - `'true'`/`'false'` (form SSR con un solo input)
 *   - `['false', 'true']` (form SSR con hidden-twin — la última verdad es el checkbox marcado)
 *   - `'false'` sola (form SSR con hidden-twin — checkbox NO marcado)
 * Cualquier otra cosa retorna undefined (falla la validación aguas arriba).
 * @param {*} v - Valor a coercionar.
 * @returns {boolean|undefined} Booleano resultante o `undefined` si no se pudo coercionar.
 * @example
 * coerceCheckbox(true)       // true
 * coerceCheckbox('false')    // false
 * coerceCheckbox(['false', 'true']) // true
 */
function coerceCheckbox(v) {
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) {
    // Hidden-twin: si contiene 'true' el checkbox estaba marcado.
    return v.some((x) => x === 'true' || x === true);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}
