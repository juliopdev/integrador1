import { logger } from '../../../infrastructure/providers/logger.js';

/**
 * Adaptador stub del proxy Caddy (Slice A). Los métodos son best-effort: en Slice A NO tocan Caddy
 * real — sólo emiten un log de intención para que quede rastro. El estado autoritativo vive en la
 * DB (`frontend_deploys`), y al arrancar el servidor Caddy re-siembra su config desde ahí (patrón
 * pull, resiliente a reinicios).
 *
 * Slice B integrará el Admin API de Caddy (`POST /config/apps/http/servers/...`) con reload atómico
 * y verificación, cambiando esta implementación sin tocar los use cases.
 */
export function createCaddyProxyAdapter() {
  return {
    /**
     * Registra una regla de redirect `<subdomain>.<apex> → externalUrl`.
     * @param {Object} params
     * @param {string} params.subdomain - Subdominio del tenant.
     * @param {string} params.externalUrl - URL externa de destino.
     * @returns {Promise<{applied: boolean, reason: string}>}
     */
    async registerRedirect({ subdomain, externalUrl }) {
      // Slice A: solo log — la persistencia en DB manda; Caddy se re-siembra al reiniciar.
      logger.info({ subdomain, externalUrl }, '[caddy-stub] register redirect');
      return { applied: false, reason: 'stub' };
    },

    /**
     * Elimina una regla de redirect previamente registrada. Idempotente.
     * @param {Object} params
     * @param {string} params.subdomain - Subdominio del tenant.
     * @returns {Promise<{applied: boolean, reason: string}>}
     */
    async removeRedirect({ subdomain }) {
      logger.info({ subdomain }, '[caddy-stub] remove redirect');
      return { applied: false, reason: 'stub' };
    },
  };
}
