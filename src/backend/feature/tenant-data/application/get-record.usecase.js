/**
 * Fábrica para el caso de uso que obtiene un único registro dinámico por su identificador.
 *
 * @param {Object} deps - Dependencias de persistencia.
 * @param {Function} deps.resolveStore - Adaptador para resolver la conexión de base de datos activa del tenant.
 * @param {string} deps.tenantId - ID del tenant space.
 * @param {Object} deps.tenantDb - Instancia de Drizzle de la base del tenant.
 * @returns {(params: { resource: Object, id: string }) => Promise<Object|null>} Función de caso de uso.
 */
/**
 * @param {Object} deps
 * @param {Function} deps.resolveStore
 * @param {string} deps.tenantId
 * @param {Object} deps.tenantDb
 * @returns {(params: { resource: Object, id: string }) => Promise<Object|null>}
 */
export function makeGetRecord({ resolveStore, tenantId, tenantDb }) {
  /**
   * Obtiene un registro dinámico por su ID.
   * @param {Object} params
   * @param {Object} params.resource - Definición del resource.
   * @param {string} params.id - ID del registro.
   * @returns {Promise<Object|null>} El registro encontrado o null si no existe.
   */
  return async function getRecord({ resource, id }) {
    const store = await resolveStore({ tenantId, tenantDb, storeType: resource.store });
    return store.findById(resource.physicalName, id);
  };
}
