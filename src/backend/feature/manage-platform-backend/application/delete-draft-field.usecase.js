import { NotFoundError } from '../../../common/errors.js';

/**
 * Elimina un field del draft por su id. La eliminación por **id** (no por name) preserva la
 * invariante de la migración de Fase 4: el `field.id` es la identidad estable del campo.
 *
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { resourceName: string, fieldId: string }) => Promise<{resourceName: string, fields: string[]}>} Función de caso de uso.
 * @throws {NotFoundError} `NO_DRAFT` | `RESOURCE_NOT_FOUND` | `FIELD_NOT_FOUND`
 */
export function makeDeleteDraftField({ contractRepository, now = () => Date.now() }) {
  /**
   * Elimina un field del draft por su id (identidad estable).
   * @param {Object} params
   * @param {string} params.resourceName - Nombre del resource que contiene el field.
   * @param {string} params.fieldId - ID del field a eliminar.
   * @returns {Promise<{resourceName: string, fields: string[]}>} Resource name + lista de field names restantes.
   * @throws {NotFoundError} NO_DRAFT | RESOURCE_NOT_FOUND | FIELD_NOT_FOUND
   */
  return async function deleteDraftField({ resourceName, fieldId }) {
    const draft = contractRepository.getDraft();
    if (!draft) {
      throw new NotFoundError('NO_DRAFT', 'No hay un draft en curso.');
    }
    const resources = draft.schema.resources || [];
    const idx = resources.findIndex((r) => r.name === resourceName);
    if (idx < 0) {
      throw new NotFoundError('RESOURCE_NOT_FOUND', `El draft no contiene el resource "${resourceName}".`);
    }
    const resource = resources[idx];
    const fields = resource.fields || [];
    if (!fields.some((f) => f.id === fieldId)) {
      throw new NotFoundError('FIELD_NOT_FOUND', `El resource no tiene un field con id "${fieldId}".`);
    }
    const nextFields = fields.filter((f) => f.id !== fieldId);
    const nextResources = [...resources];
    nextResources[idx] = { ...resource, fields: nextFields };
    contractRepository.saveDraft({
      version: draft.version,
      schemaJson: JSON.stringify({ ...draft.schema, resources: nextResources }),
      now: now(),
    });
    return { resourceName, fields: nextFields.map((f) => f.name) };
  };
}
