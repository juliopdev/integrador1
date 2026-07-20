/**
 * Fábrica para el caso de uso que recupera registros dinámicos de forma paginada para un recurso específico.
 * Resuelve dinámicamente el store físico asignado (Neon/MongoDB Atlas) y recupera la colección correspondiente.
 *
 * @param {Object} deps - Dependencias.
 * @param {Function} deps.resolveStore - Función adaptadora para resolver el driver y conexión de base de datos del tenant.
 * @param {string} deps.tenantId - ID único del tenant space.
 * @param {Object} deps.tenantDb - Instancia de Drizzle conectada a la base del tenant.
 * @returns {(params: { resource: Object, limit?: number, offset?: number }) => Promise<{ records: Array<Object>, pagination: { limit: number, offset: number, count: number } }>} Función de caso de uso.
 */
/**
 * @param {Object} deps
 * @param {Function} deps.resolveStore
 * @param {string} deps.tenantId
 * @param {Object} deps.tenantDb
 * @returns {(params: { resource: Object, limit?: number, offset?: number }) => Promise<{ records: Array<Object>, pagination: { limit: number, offset: number, count: number } }>}
 */
export function makeFindDynamicRecords({ resolveStore, tenantId, tenantDb }) {
  /**
   * Recupera registros dinámicos paginados para un resource específico.
   * @param {Object} params
   * @param {Object} params.resource - Definición del resource.
   * @param {number} [params.limit=20] - Máx. registros.
   * @param {number} [params.offset=0] - Desplazamiento.
   * @returns {Promise<{ records: Array<Object>, pagination: { limit: number, offset: number, count: number } }>}
   */
  return async function findDynamicRecords({ resource, limit = 20, offset = 0 }) {
    const store = await resolveStore({ tenantId, tenantDb, storeType: resource.store });
    const records = await store.findMany(resource.physicalName, { limit, offset });
    return { records, pagination: { limit, offset, count: records.length } };
  };
}
