import { parsePagination, buildPageMeta } from '../../../common/pagination.js';

const ALLOWED_MIME_FAMILIES = new Set(['image', 'video', 'audio', 'document']);
const ALLOWED_PROVIDERS = new Set(['cloudinary', 'box']);

/**
 * P8.2: lista paginada del catálogo local de assets del tenant para la "Biblioteca de medios"
 * del Master. Filtros combinables:
 *   - `provider` — `cloudinary` | `box` (opcional)
 *   - `type` — familia MIME: `image` | `video` | `audio` | `document` (opcional; array o string)
 *
 * **Primer uso real de `common/pagination.js`** (deuda P8.1.1 saldada).
 *
 * @param {{ assetRepository: object }} deps
 * @returns {(params: { query: object }) => Promise<{ data: Array<object>, meta: object }>}
 */
/**
 * @param {Object} deps
 * @param {Object} deps.assetRepository
 * @returns {(params: { query?: Object }) => Promise<{ data: Array<Object>, meta: Object }>}
 */
export function makeListAssets({ assetRepository }) {
  /**
   * Lista paginada de assets activos del catálogo local del tenant.
   * Filtros combinables por provider y tipo MIME.
   * @param {Object} params
   * @param {Object} [params.query={}] - Query string con filters + paginación.
   * @param {string} [params.query.provider] - cloudinary|box.
   * @param {string|string[]} [params.query.type] - Familia MIME: image|video|audio|document.
   * @param {string|number} [params.query.page] - Número de página.
   * @param {string|number} [params.query.limit] - Registros por página.
   * @returns {Promise<{ data: Array<Object>, meta: Object }>}
   */
  return async function listAssets({ query = {} }) {
    const { limit, page, offset } = parsePagination(query);

    // Normalización de filtros. Silencioso ante valores desconocidos (Zod ya rechaza en la
    // capa de handler; acá es doble seguro para consumo directo desde tests).
    const provider = ALLOWED_PROVIDERS.has(query.provider) ? query.provider : null;

    const rawTypes = query.type;
    const types = Array.isArray(rawTypes)
      ? rawTypes
      : (typeof rawTypes === 'string' && rawTypes ? [rawTypes] : []);
    const mimeFamilies = types.filter((t) => ALLOWED_MIME_FAMILIES.has(t));

    const filters = { provider, mimeFamilies: mimeFamilies.length ? mimeFamilies : null };
    const data = assetRepository.listActive({ limit, offset, ...filters });
    const total = assetRepository.countActive(filters);
    return { data, meta: buildPageMeta({ page, limit, total }) };
  };
}
