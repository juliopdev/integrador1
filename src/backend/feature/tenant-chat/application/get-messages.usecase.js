import { DomainError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que recupera mensajes de un canal de chat, paginados.
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.messageRepository - Repositorio de mensajes del chat.
 * @returns {(params: { channel: string, limit?: number, offset?: number }) => Promise<Array<Object>>}
 */
export function makeGetMessages({ messageRepository }) {
  /**
   * Obtiene mensajes de un canal de chat específico con paginación.
   * @param {Object} params
   * @param {string} params.channel - Identificador del canal (ej: 'ws_support_global').
   * @param {number} [params.limit=50] - Máximo de mensajes a retornar.
   * @param {number} [params.offset=0] - Desplazamiento para paginación.
   * @returns {Promise<Array<{ id: string, sender: { id: string, email: string, scope: string }, text: string, channel: string, createdAt: string }>>}
   * @throws {DomainError} Si no se especifica el canal.
   */
  return async function getMessages({ channel, limit = 50, offset = 0 }) {
    if (!channel) {
      throw new DomainError('CHANNEL_REQUIRED', 'El canal es requerido.');
    }
    return messageRepository.getMessagesByChannel(channel, limit, offset);
  };
}
