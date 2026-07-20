import { NotFoundError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que obtiene un tenant por su ID.
 * Lanza `NotFoundError` si no existe o fue eliminado lógicamente.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.tenantRepository - Repositorio de tenants de plataforma.
 * @returns {(params: { tenantId: string }) => Promise<Object>}
 * @throws {NotFoundError} `TENANT_NOT_FOUND` — si el tenant no existe o fue eliminado.
 */
export function makeGetTenantById({ tenantRepository }) {
  /**
   * Obtiene un tenant por su identificador único.
   * @param {Object} params - Parámetros de consulta.
   * @param {string} params.tenantId - ID del tenant.
   * @returns {Promise<Object>} Datos completos del tenant.
   * @throws {NotFoundError} `TENANT_NOT_FOUND`
   */
  return async function getTenantById({ tenantId }) {
    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe o fue eliminado.');
    }
    return tenant;
  };
}
