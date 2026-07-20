import { DomainError, NotFoundError } from '../../../common/errors.js';
import { WS_CHANNELS } from '../domain/no-code-constants.js';

/**
 * Fábrica para eliminación lógica de un backend.
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { version: string }) => Promise<{version: string}>}
 */
export function makeDeleteBackend({ contractRepository, now = () => Date.now() }) {
  /**
   * Eliminación **lógica** de un backend (no borra los datos de negocio en el proveedor).
   * @param {Object} params
   * @param {string} params.version - Versión del backend a retirar.
   * @returns {Promise<{version: string}>} Versión retirada.
   * @throws {NotFoundError} BACKEND_NOT_FOUND
   */
  return async function deleteBackend({ version }) {
    if (!contractRepository.getByVersion(version)) {
      throw new NotFoundError('BACKEND_NOT_FOUND', 'No existe un backend con esa versión.');
    }
    contractRepository.retire({ version, now: now() });
    return { version };
  };
}

/**
 * Fábrica para toggle de API Auth de Users.
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { enabled: boolean, strategies?: string[] }) => Promise<{userAuthEnabled: boolean}>}
 */
export function makeToggleApiAuth({ contractRepository, now = () => Date.now() }) {
  /**
   * Habilita/Deshabilita la API Auth de Users y sus estrategias sobre el contrato activo.
   * @param {Object} params
   * @param {boolean} params.enabled - Si la API Auth está habilitada.
   * @param {string[]} [params.strategies] - Estrategias de autenticación.
   * @returns {Promise<{userAuthEnabled: boolean}>} Estado resultante.
   * @throws {NotFoundError} NO_BACKEND
   */
  return async function toggleApiAuth({ enabled, strategies }) {
    const active = contractRepository.getActiveContract();
    if (!active) throw new NotFoundError('NO_BACKEND', 'No hay un backend publicado.');
    const auth = { ...active.schema.auth, userAuthEnabled: enabled };
    if (strategies) auth.strategies = strategies;
    contractRepository.updateActiveSchema({ schemaJson: JSON.stringify({ ...active.schema, auth }), now: now() });
    return { userAuthEnabled: enabled };
  };
}

/**
 * Habilita/Deshabilita un canal WebSocket en el contrato activo. (TODO Fase 5: `user_to_admin`
 * auto-genera el rol `support`; habilitar canales exige MongoDB Atlas del tenant.)
 */
export function makeToggleWsChannel({ contractRepository, now = () => Date.now() }) {
  /**
   * Habilita/Deshabilita un canal WebSocket en el contrato activo.
   * @param {Object} params
   * @param {string} params.channel - Nombre del canal WebSocket.
   * @param {boolean} params.enabled - Si el canal está habilitado.
   * @returns {Promise<{channel: string, enabled: boolean}>} Canal y estado resultante.
   * @throws {DomainError} INVALID_CHANNEL
   * @throws {NotFoundError} NO_BACKEND
   */
  return async function toggleWsChannel({ channel, enabled }) {
    if (!WS_CHANNELS.includes(channel)) {
      throw new DomainError('INVALID_CHANNEL', 'Canal de WebSocket inválido.');
    }
    const active = contractRepository.getActiveContract();
    if (!active) throw new NotFoundError('NO_BACKEND', 'No hay un backend publicado.');
    const channels = new Set(active.schema.websocket?.channels ?? []);
    if (enabled) channels.add(channel);
    else channels.delete(channel);
    contractRepository.updateActiveSchema({
      schemaJson: JSON.stringify({ ...active.schema, websocket: { channels: [...channels] } }),
      now: now(),
    });
    return { channel, enabled };
  };
}
