import { NotFoundError } from '../../../common/errors.js';

/**
 * Elimina un endpoint del draft por su `path` (identidad natural del contrato). El handler recibe
 * el path desde el URL en base64-url para evitar problemas con `/` y ASCII especial.
 *
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { path: string }) => Promise<{endpoints: {path: string, methods: string[]}[]}>} Función de caso de uso.
 * @throws {NotFoundError} `NO_DRAFT` | `ENDPOINT_NOT_FOUND`
 */
export function makeDeleteDraftEndpoint({ contractRepository, now = () => Date.now() }) {
  /**
   * Elimina un endpoint del draft por su path.
   * @param {Object} params
   * @param {string} params.path - Path del endpoint a eliminar.
   * @returns {Promise<{endpoints: {path: string, methods: string[]}[]>} Lista actualizada de endpoints.
   * @throws {NotFoundError} NO_DRAFT | ENDPOINT_NOT_FOUND
   */
  return async function deleteDraftEndpoint({ path }) {
    const draft = contractRepository.getDraft();
    if (!draft) {
      throw new NotFoundError('NO_DRAFT', 'No hay un draft en curso.');
    }
    const endpoints = draft.schema.endpoints || [];
    if (!endpoints.some((e) => e.path === path)) {
      throw new NotFoundError('ENDPOINT_NOT_FOUND', `El draft no tiene un endpoint con path "${path}".`);
    }
    const nextEndpoints = endpoints.filter((e) => e.path !== path);
    contractRepository.saveDraft({
      version: draft.version,
      schemaJson: JSON.stringify({ ...draft.schema, endpoints: nextEndpoints }),
      now: now(),
    });
    return { endpoints: nextEndpoints.map((e) => ({ path: e.path, methods: e.methods })) };
  };
}
