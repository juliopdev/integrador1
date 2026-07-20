import { DomainError, NotFoundError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que actualiza parcialmente (PUT/PATCH) un registro dinámico.
 * Compila un esquema dinámico parcial con soporte para coacción (submits del Form HTML),
 * valida y sanitiza el body, actualiza `updated_at` y persiste los cambios en base de datos.
 *
 * @param {Object} deps - Dependencias.
 * @param {Function} deps.resolveStore - Adaptador para resolver la conexión de base de datos activa del tenant.
 * @param {string} deps.tenantId - ID único del tenant space.
 * @param {Object} deps.tenantDb - Instancia de Drizzle conectada al tenant space.
 * @param {Function} deps.compileResourceSchema - Compilador de esquemas Zod desde resources del contrato.
 * @returns {(params: { resource: Object, id: string, body: Object }) => Promise<Object>} Función de caso de uso.
 */
/**
 * @param {Object} deps
 * @param {Function} deps.resolveStore
 * @param {string} deps.tenantId
 * @param {Object} deps.tenantDb
 * @param {Function} deps.compileResourceSchema
 * @returns {(params: { resource: Object, id: string, body: Object }) => Promise<Object>}
 */
export function makeUpdateDynamicRecord({ resolveStore, tenantId, tenantDb, compileResourceSchema }) {
  /**
   * Actualiza parcialmente (PUT/PATCH) un registro dinámico. Compila un esquema Zod parcial,
   * valida el body y persiste los cambios actualizando updated_at.
   * @param {Object} params
   * @param {Object} params.resource - Definición del resource.
   * @param {string} params.id - ID del registro a actualizar.
   * @param {Object} params.body - Datos parciales a actualizar.
   * @returns {Promise<Object>} Registro actualizado.
   * @throws {DomainError} Si la validación del body falla.
   * @throws {NotFoundError} Si el registro no existe o fue eliminado.
   */
  return async function updateDynamicRecord({ resource, id, body }) {
    const schema = compileResourceSchema(resource, { partial: true, coerce: true });
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Body inválido.');
    }
    const patch = { ...parsed.data, updated_at: Date.now() };
    const store = await resolveStore({ tenantId, tenantDb, storeType: resource.store });
    const updated = await store.update(resource.physicalName, id, patch);
    if (!updated) {
      throw new NotFoundError('RECORD_NOT_FOUND', 'El record no existe o fue eliminado.');
    }
    return updated;
  };
}
