import { NotFoundError } from '../../../common/errors.js';

/**
 * Obtiene el deploy actual del tenant + su tenant asociado. Falla si el tenantId no existe (no
 * soft-deleted). Si nunca configuró frontend, retorna `deploy: null` — la vista muestra el CTA.
 *
 * @param {{ deployRepository: object, tenantRepository: object }} deps
 * @returns {(params: { tenantId: string }) => Promise<{tenant: Object, deploy: Object|null}>} Función de caso de uso.
 */
export function makeGetFrontendDeploy({ deployRepository, tenantRepository }) {
  /**
   * Obtiene el deploy actual del tenant + su tenant asociado.
   * @param {Object} params
   * @param {string} params.tenantId - ID del tenant.
   * @returns {Promise<{tenant: Object, deploy: Object|null}>} Tenant y su deploy (null si no configuró).
   * @throws {NotFoundError} TENANT_NOT_FOUND
   */
  return async function getFrontendDeploy({ tenantId }) {
    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe o fue eliminado.');
    const deploy = deployRepository.findByTenantId(tenantId);
    return { tenant, deploy };
  };
}
