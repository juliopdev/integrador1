import { uuidv7 } from '../../../common/id.js';
import { DomainError, NotFoundError } from '../../../common/errors.js';

/**
 * Configura el modo "externo": el tenant apuntará su subdominio (`<sub>.<apex>`) a una URL
 * externa vía redirect gestionado por Caddy. Persiste en `frontend_deploys` con `mode='external'`
 * y notifica al adaptador Caddy (Slice A: stub — la persistencia manda; ver caddy-proxy.adapter).
 *
 * Validaciones de URL (security.md):
 * - Debe parsear con `URL`.
 * - Protocolo **estrictamente HTTPS**. HTTP-only queda fuera para no degradar la experiencia del
 *   end-user (mixed-content, warnings del navegador, riesgo MITM).
 * - Sin puertos personalizados (evita filtrar servicios internos por accidente).
 * - Longitud ≤ 2000 chars (defensa contra abuso).
 *
 * @param {{
 *   deployRepository: object,
 *   tenantRepository: object,
 *   caddyProxy: { registerRedirect: Function },
 *   logger: object,
 *   invalidateSubdomainCache?: (subdomain: string) => Promise<void>,
 *   now?: () => number
 * }} deps
 * @returns {(params: { tenantId: string, externalUrl: string }) => Promise<{tenantId: string, mode: string, externalUrl: string, status: string, updatedAt: number}>} Función de caso de uso.
 */
export function makeSetExternalRedirect({ deployRepository, tenantRepository, caddyProxy, logger, invalidateSubdomainCache = async () => {}, now = () => Date.now() }) {
  /**
   * Configura el modo "externo": redirect del subdominio del tenant a una URL externa vía Caddy.
   * @param {Object} params
   * @param {string} params.tenantId - ID del tenant.
   * @param {string} params.externalUrl - URL externa de destino (solo HTTPS, sin puerto).
   * @returns {Promise<{tenantId: string, mode: string, externalUrl: string, status: string, updatedAt: number}>}
   * @throws {NotFoundError} TENANT_NOT_FOUND
   * @throws {DomainError} VALIDATION_ERROR | INSECURE_URL
   */
  return async function setExternalRedirect({ tenantId, externalUrl }) {
    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe o fue eliminado.');

    const cleaned = String(externalUrl ?? '').trim();
    if (!cleaned) throw new DomainError('VALIDATION_ERROR', 'La URL externa es requerida.');
    if (cleaned.length > 2000) throw new DomainError('VALIDATION_ERROR', 'La URL excede 2000 caracteres.');
    let parsed;
    try { parsed = new URL(cleaned); } catch { throw new DomainError('VALIDATION_ERROR', 'La URL no es válida.'); }
    if (parsed.protocol !== 'https:') {
      throw new DomainError('INSECURE_URL', 'Sólo se permiten URLs HTTPS.');
    }
    if (parsed.port && parsed.port !== '' && parsed.port !== '443') {
      throw new DomainError('VALIDATION_ERROR', 'Los puertos personalizados no están permitidos.');
    }

    const ts = now();
    const id = uuidv7();
    deployRepository.upsert({
      id, tenantId, mode: 'external', externalUrl: cleaned, status: 'active', now: ts,
    });

    // Slice A: el adapter es stub. Log de intención, sin bloquear el response si algo raro sale.
    try {
      await caddyProxy.registerRedirect({ subdomain: tenant.subdomain, externalUrl: cleaned });
    } catch (err) {
      logger.error({ err, subdomain: tenant.subdomain }, '[frontend] caddy register failed');
    }

    // El `tenant-loader` cachea `externalUrl`/`frontendMode` por subdominio (60s). Sin invalidar,
    // el redirect (o el cambio de modo) tardaría hasta el TTL en surtir efecto.
    try {
      await invalidateSubdomainCache(tenant.subdomain);
    } catch (err) {
      logger.error({ err, subdomain: tenant.subdomain }, '[frontend] cache invalidation failed');
    }

    return { tenantId, mode: 'external', externalUrl: cleaned, status: 'active', updatedAt: ts };
  };
}
