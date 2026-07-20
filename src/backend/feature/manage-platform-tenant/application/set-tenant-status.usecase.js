import { DomainError, NotFoundError } from '../../../common/errors.js';
import { uuidv7 } from '../../../common/id.js';

const ALLOWED = new Set(['active', 'suspended']);

/**
 * Fábrica para el caso de uso que establece el estado de un tenant en la plataforma
 * a un valor **explícito**. Reemplaza al anterior "toggle" para evitar re-inversiones
 * accidentales por reintento de red o doble-click (idempotencia real).
 *
 * Reglas:
 *  - `desiredStatus` debe ser `active` o `suspended` (transiciones legales del panel).
 *  - Si el estado actual ya es el deseado, es un no-op idempotente.
 *  - Cualquier otra transición registra evento, invalida caché y publica el evento de control.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.tenantRepository - Repositorio de tenants de plataforma.
 * @param {(event: Object) => Promise<void>} [deps.publishControlEvent] - Publicador de eventos de control.
 * @param {(subdomain: string) => Promise<void>} [deps.invalidateSubdomainCache] - Invalidación de caché de subdominio.
 * @param {import('pino').Logger} deps.logger - Logger de la aplicación.
 * @returns {(params: { tenantId: string, desiredStatus: 'active'|'suspended' }) => Promise<{ id: string, status: 'active'|'suspended' }>}
 * @throws {DomainError} `INVALID_STATUS` — si el estado destino no es válido.
 * @throws {NotFoundError} `TENANT_NOT_FOUND` — si el tenant no existe.
 */
export function makeSetTenantStatus({
  tenantRepository,
  publishControlEvent = async () => {},
  invalidateSubdomainCache = async () => {},
  logger,
}) {
  /**
   * Establece el estado de un tenant de forma explícita e idempotente.
   * @param {Object} params - Parámetros del cambio de estado.
   * @param {string} params.tenantId - ID del tenant.
   * @param {'active'|'suspended'} params.desiredStatus - Estado destino.
   * @returns {Promise<{ id: string, status: 'active'|'suspended' }>}
   * @throws {DomainError} `INVALID_STATUS`
   * @throws {NotFoundError} `TENANT_NOT_FOUND`
   */
  return async function setTenantStatus({ tenantId, desiredStatus }) {
    if (!ALLOWED.has(desiredStatus)) {
      throw new DomainError('INVALID_STATUS', 'El estado destino debe ser "active" o "suspended".');
    }

    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe.');
    }

    // No-op idempotente: reintentos por red no revierten el estado.
    if (tenant.status === desiredStatus) {
      return { id: tenantId, status: desiredStatus };
    }

    const now = Date.now();
    tenantRepository.updateStatus({ tenantId, status: desiredStatus, now });
    tenantRepository.insertStatusEvent({
      id: uuidv7(),
      tenantId,
      event: desiredStatus === 'active' ? 'enabled' : 'disabled',
      now,
    });

    try {
      await invalidateSubdomainCache(tenant.subdomain);
    } catch (err) {
      logger.error({ err }, 'Error invalidando caché de tenant');
    }

    try {
      await publishControlEvent({
        event: 'tenant:set-status',
        data: { tenantId, status: desiredStatus },
      });
    } catch (err) {
      logger.error({ err }, 'Error publicando estado de tenant');
    }

    return { id: tenantId, status: desiredStatus };
  };
}
