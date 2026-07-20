import { NotFoundError } from '../../../common/errors.js';

/**
 * Actualiza la sección `auth` del draft del asistente No-Code (sub-slice a-4). Deshabilitar
 * (`userAuthEnabled: false`) **limpia** strategies + redirectUris para no dejar configuración
 * zombi (se acordó con security.md: los flujos OAuth sin auth activo no deben quedar apuntando a
 * `redirectUris`). Al re-habilitarse, el Superadmin vuelve a definir su matriz.
 *
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { userAuthEnabled: boolean, strategies?: string[], redirectUris?: string[] }) => Promise<{userAuthEnabled: boolean, strategies: string[], redirectUris: string[]}>} Función de caso de uso.
 * @throws {NotFoundError} `NO_DRAFT`
 */
export function makeUpdateDraftAuth({ contractRepository, now = () => Date.now() }) {
  /**
   * Actualiza la sección `auth` del draft del asistente No-Code.
   * @param {Object} params
   * @param {boolean} params.userAuthEnabled - Si la autenticación de usuarios está habilitada.
   * @param {string[]} [params.strategies] - Estrategias de autenticación.
   * @param {string[]} [params.redirectUris] - URIs de redirección OAuth.
   * @returns {Promise<{userAuthEnabled: boolean, strategies: string[], redirectUris: string[]}>} Estado auth actualizado.
   * @throws {NotFoundError} NO_DRAFT
   */
  return async function updateDraftAuth({ userAuthEnabled, strategies, redirectUris }) {
    const draft = contractRepository.getDraft();
    if (!draft) {
      throw new NotFoundError('NO_DRAFT', 'No hay un draft en curso.');
    }

    const enabled = Boolean(userAuthEnabled);
    const cleanArray = (input) => {
      if (!Array.isArray(input)) return [];
      return [...new Set(input.filter((v) => typeof v === 'string' && v.trim().length > 0))];
    };
    const nextAuth = enabled
      ? { userAuthEnabled: true, strategies: cleanArray(strategies), redirectUris: cleanArray(redirectUris) }
      : { userAuthEnabled: false, strategies: [], redirectUris: [] };

    contractRepository.saveDraft({
      version: draft.version,
      schemaJson: JSON.stringify({ ...draft.schema, auth: nextAuth }),
      now: now(),
    });
    return nextAuth;
  };
}
