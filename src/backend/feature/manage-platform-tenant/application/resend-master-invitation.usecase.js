import { NotFoundError } from '../../../common/errors.js';

/**
 * Fábrica (orquestador) para reenviar la invitación de activación al Master de un tenant.
 * Espeja a `provisionNewTenant`: recibe factories por-tenant y compone el flujo cross-DB —
 * resuelve el subdominio en `platform.db`, regenera el token en el `tenant.db` y despacha
 * el correo.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.tenantRepository - Repositorio de tenants de plataforma.
 * @param {(tenantId: string) => () => { email: string, rawToken: string }} deps.regenerateTokenFor
 *   - Factory per-tenant que compone `regenerateActivationToken`.
 * @param {(params: { email: string, subdomain: string, rawToken: string }) => Promise<{ url: string }>} deps.sendWelcome
 *   - Caso de uso de envío de correo de bienvenida.
 * @returns {(params: { tenantId: string }) => Promise<{ email: string }>}
 * @throws {NotFoundError} `TENANT_NOT_FOUND` — si el tenant no existe.
 */
export function makeResendMasterInvitation({ tenantRepository, regenerateTokenFor, sendWelcome }) {
  /**
   * Reenvía la invitación de activación al Master del tenant.
   * @param {Object} params - Parámetros del reenvío.
   * @param {string} params.tenantId - ID del tenant.
   * @returns {Promise<{ email: string }>} Correo del Master al que se reenvió la invitación.
   * @throws {NotFoundError} `TENANT_NOT_FOUND`
   */
  return async function resendMasterInvitation({ tenantId }) {
    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe.');
    }

    const { email, rawToken } = regenerateTokenFor(tenantId)();
    await sendWelcome({ email, subdomain: tenant.subdomain, rawToken });

    return { email };
  };
}
