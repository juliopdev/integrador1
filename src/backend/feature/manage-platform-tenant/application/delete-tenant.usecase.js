import { DomainError, NotFoundError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que elimina lógicamente (soft-delete) un tenant de la plataforma.
 * Exige `confirmSubdomain` en la petición y valida server-side que coincida con el del tenant.
 * Esta segunda barrera cierra el vector donde una vulnerabilidad de XSS/CSRF pudiera disparar
 * un DELETE con solo el ID (obtenible del listado o del historial de sesión). Además, marca al
 * tenant como eliminado, limpia la caché de subdominio en Valkey y notifica para desconectar
 * cualquier conexión en tiempo real activa asociada.
 *
 * @param {Object} deps
 * @param {Object} deps.tenantRepository
 * @param {(event: Object) => Promise<void>} [deps.publishControlEvent]
 * @param {(subdomain: string) => Promise<void>} [deps.invalidateSubdomainCache]
 * @param {import('pino').Logger} deps.logger
 * @returns {(params: { tenantId: string, confirmSubdomain: string }) => Promise<{ id: string, deletedAt: number }>}
 */
export function makeDeleteTenant({
  tenantRepository,
  publishControlEvent = async () => {},
  invalidateSubdomainCache = async () => {},
  logger,
}) {
  /**
   * Ejecuta el soft-delete de un tenant tras validar la confirmación del subdominio.
   * @param {Object} params - Parámetros de eliminación.
   * @param {string} params.tenantId - ID del tenant.
   * @param {string} params.confirmSubdomain - Subdominio del tenant (debe coincidir para proceder).
   * @returns {Promise<{ id: string, deletedAt: number }>}
   * @throws {NotFoundError} `TENANT_NOT_FOUND`
   * @throws {DomainError} `SUBDOMAIN_MISMATCH`
   */
  return async function deleteTenant({ tenantId, confirmSubdomain }) {
    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe.');
    }

    if (typeof confirmSubdomain !== 'string' || confirmSubdomain.trim().toLowerCase() !== tenant.subdomain) {
      throw new DomainError('SUBDOMAIN_MISMATCH', 'La confirmación del subdominio no coincide con el tenant.');
    }

    const now = Date.now();
    tenantRepository.softDelete({ tenantId, now });

    try {
      await invalidateSubdomainCache(tenant.subdomain);
    } catch (err) {
      logger.error({ err }, 'Error invalidando caché de tenant');
    }

    try {
      await publishControlEvent({
        event: 'tenant:delete',
        data: { tenantId },
      });
    } catch (err) {
      logger.error({ err }, 'Error publicando eliminación de tenant');
    }

    return { id: tenantId, deletedAt: now };
  };
}
