import { NotFoundError } from '../../../common/errors.js';

/**
 * Elimina la configuración de frontend del tenant. Slice A: sólo modo externo → notifica al
 * adaptador Caddy y borra la fila. Slice B extenderá para `hosted`: borrado físico de
 * `deployment/<tenantId>/`.
 *
 * @param {{ deployRepository: object, tenantRepository: object, caddyProxy: { removeRedirect: Function }, logger: object, invalidateSubdomainCache?: (subdomain: string) => Promise<void> }} deps
 * @returns {(params: { tenantId: string }) => Promise<{tenantId: string, deleted: boolean}>} Función de caso de uso.
 */
export function makeDeleteFrontendDeploy({ deployRepository, tenantRepository, caddyProxy, logger, invalidateSubdomainCache = async () => {} }) {
  /**
   * Elimina la configuración de frontend del tenant: notifica a Caddy y borra el registro.
   * @param {Object} params
   * @param {string} params.tenantId - ID del tenant.
   * @returns {Promise<{tenantId: string, deleted: boolean}>} Resultado de la eliminación.
   * @throws {NotFoundError} TENANT_NOT_FOUND | DEPLOY_NOT_FOUND
   */
  return async function deleteFrontendDeploy({ tenantId }) {
    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe o fue eliminado.');
    const existing = deployRepository.findByTenantId(tenantId);
    if (!existing) throw new NotFoundError('DEPLOY_NOT_FOUND', 'El tenant no tiene deploy configurado.');

    // Notificar al proxy antes de borrar el registro — si el borrado remoto fallara luego, el
    // registro seguiría en DB y podríamos reintentar; al revés perderíamos rastro.
    try {
      await caddyProxy.removeRedirect({ subdomain: tenant.subdomain });
    } catch (err) {
      logger.error({ err, subdomain: tenant.subdomain }, '[frontend] caddy remove failed');
    }

    deployRepository.deleteByTenantId(tenantId);

    // Invalida la resolución cacheada: si no, el subdominio seguiría redirigiendo/sirviendo el
    // frontend borrado hasta el TTL (60s).
    try {
      await invalidateSubdomainCache(tenant.subdomain);
    } catch (err) {
      logger.error({ err, subdomain: tenant.subdomain }, '[frontend] cache invalidation failed');
    }

    return { tenantId, deleted: true };
  };
}
