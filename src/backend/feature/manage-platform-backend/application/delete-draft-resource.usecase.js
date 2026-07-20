import { NotFoundError } from '../../../common/errors.js';

/**
 * Elimina un resource del draft por su nombre y elimina también su endpoint asociado.
 *
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { name: string }) => Promise<{deleted: boolean, name: string}>} Función de caso de uso.
 * @throws {NotFoundError} `NO_DRAFT` | `RESOURCE_NOT_FOUND`
 */
export function makeDeleteDraftResource({ contractRepository, now = () => Date.now() }) {
  /**
   * Elimina un resource del draft y su endpoint asociado.
   * @param {Object} params
   * @param {string} params.name - Nombre del resource a eliminar.
   * @returns {Promise<{deleted: boolean, name: string}>} Resultado de la eliminación.
   * @throws {NotFoundError} NO_DRAFT | RESOURCE_NOT_FOUND
   */
  return async function deleteDraftResource({ name }) {
    const draft = contractRepository.getDraft();
    if (!draft) {
      throw new NotFoundError('NO_DRAFT', 'No hay un draft en curso.');
    }
    const resources = draft.schema.resources || [];
    if (!resources.some((r) => r.name === name)) {
      throw new NotFoundError('RESOURCE_NOT_FOUND', `El draft no contiene el resource "${name}".`);
    }

    const nextResources = resources.filter((r) => r.name !== name);
    
    // Eliminar también endpoints asociados a este recurso
    const endpoints = draft.schema.endpoints || [];
    const nextEndpoints = endpoints.filter((e) => e.resource !== name);

    contractRepository.saveDraft({
      version: draft.version,
      schemaJson: JSON.stringify({
        ...draft.schema,
        resources: nextResources,
        endpoints: nextEndpoints
      }),
      now: now(),
    });

    return { deleted: true, name };
  };
}
