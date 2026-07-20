import { NotFoundError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que ejecuta la eliminación lógica (soft-delete) de un registro dinámico.
 * Resuelve el almacén y actualiza la columna `deleted_at` del registro correspondiente.
 *
 * @param {Object} deps - Dependencias de base de datos.
 * @param {Function} deps.resolveStore - Adaptador para resolver el almacén de datos del tenant (Neon o MongoDB).
 * @param {string} deps.tenantId - ID único del tenant space.
 * @param {Object} deps.tenantDb - Instancia de Drizzle conectada a la base de datos del tenant.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @returns {(params: { resource: Object, id: string }) => Promise<{ id: string, deleted: boolean }>} Función de caso de uso.
 */
/**
 * @param {Object} deps
 * @param {Function} deps.resolveStore
 * @param {string} deps.tenantId
 * @param {Object} deps.tenantDb
 * @param {() => number} [deps.now]
 * @returns {(params: { resource: Object, id: string }) => Promise<{ id: string, deleted: boolean }>}
 */
export function makeDeleteDynamicRecord({ resolveStore, tenantId, tenantDb, now = () => Date.now() }) {
  /**
   * Ejecuta soft-delete de un registro dinámico por su ID.
   * @param {Object} params
   * @param {Object} params.resource - Definición del resource (contiene store, physicalName).
   * @param {string} params.id - ID del registro a eliminar.
   * @returns {Promise<{ id: string, deleted: boolean }>}
   * @throws {NotFoundError} Si el registro no existe o ya fue eliminado.
   */
  return async function deleteDynamicRecord({ resource, id }) {
    const store = await resolveStore({ tenantId, tenantDb, storeType: resource.store });
    const ok = await store.softDelete(resource.physicalName, id, now());
    if (!ok) {
      throw new NotFoundError('RECORD_NOT_FOUND', 'El record no existe o ya fue eliminado.');
    }
    return { id, deleted: true };
  };
}
