/**
 * Módulo de helpers de paginación server-side.
 * Provee las funciones {@link parsePagination} y {@link buildPageMeta} para normalizar
 * parámetros de paginación (page/limit 1-indexed) y construir metadatos de respuesta
 * uniformes para el cliente.
 *
 * @module pagination
 */

// Helpers de paginación server-side. Contract del proyecto:
//  - Query params: `?page=<n>&limit=<n>` (1-indexed).
//  - Default 20 / max 100 — límites de seguridad contra query bombs.
//  - Response meta: `{ page, limit, total, totalPages, hasNext, hasPrev }` para que el cliente
//    renderice la paginación sin recalcular.
//
// TODO(P8.2+): integrar en los listados que crecen rápido. Prioridad:
//   1. `GET /dashboard/gallery` (Master, imágenes de Cloudinary) — introducido en P8.2.
//   2. `GET /api-system/v1/tenants` (Superadmin, listado + Histórico).
//   3. `GET /dashboard/logs` (Superadmin, `platform_logs_local`).
//   4. `GET /api-system/v1/tenants/:tenantId/backends` (versiones del contrato).
// La primera integración real de este módulo debe salir con P8.2 para no volver a acumular deuda.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * @typedef {Object} ParsedPagination
 * @property {number} limit - Límite de elementos por página, normalizado y seguro.
 * @property {number} page - Número de página actual (basado en 1).
 * @property {number} offset - Número de registros a omitir en la consulta de base de datos.
 */

/**
 * @typedef {Object} PaginationMeta
 * @property {number} page - Número de página actual.
 * @property {number} limit - Límite de elementos por página.
 * @property {number} total - Cantidad total de registros existentes.
 * @property {number} totalPages - Cantidad total de páginas disponibles.
 * @property {boolean} hasNext - Indica si existe una página posterior.
 * @property {boolean} hasPrev - Indica si existe una página anterior.
 */

/**
 * Normaliza y valida los parámetros de paginación recibidos en una query string.
 * 
 * @param {Object} [query={}] - Parámetros de consulta (req.query).
 * @param {string|number} [query.limit] - Límite de registros solicitados.
 * @param {string|number} [query.page] - Página solicitada.
 * @returns {ParsedPagination} Parámetros de paginación parseados y offset calculado.
 * @example
 * parsePagination({ limit: '10', page: '2' })
 * // => { limit: 10, page: 2, offset: 10 }
 */
export function parsePagination(query = {}) {
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let page = Number.parseInt(query.page, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;

  return { limit, page, offset: (page - 1) * limit };
}

/**
 * Construye el objeto de metadatos necesario para respuestas paginadas uniformes.
 * 
 * @param {Object} params
 * @param {number} params.page - Página actual procesada.
 * @param {number} params.limit - Límite de elementos utilizado.
 * @param {number} params.total - Cantidad total de registros en base de datos.
 * @returns {PaginationMeta} Metadatos estructurados para el cliente.
 * @example
 * buildPageMeta({ page: 2, limit: 10, total: 45 })
 * // => { page: 2, limit: 10, total: 45, totalPages: 5, hasNext: true, hasPrev: true }
 */
export function buildPageMeta({ page, limit, total }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
