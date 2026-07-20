import { DomainError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que envía un mensaje a un canal de chat de soporte.
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.messageRepository - Repositorio de mensajes del chat.
 * @returns {(params: { id: string, sender: Object, text: string, channel: string, createdAt: string }) => Promise<Object>}
 */
export function makeSendMessage({ messageRepository }) {
  /**
   * Persiste un mensaje de chat en el canal indicado tras validar contenido y límites.
   * @param {Object} params
   * @param {string} params.id - UUIDv7 del mensaje.
   * @param {Object} params.sender - Datos del remitente ({ id, email, scope }).
   * @param {string} params.text - Contenido del mensaje (máx. 2000 caracteres).
   * @param {string} params.channel - Canal destino (ej: 'ws_support_global').
   * @param {string} params.createdAt - Timestamp ISO de creación.
   * @returns {Promise<Object>} El mensaje persistido.
   * @throws {DomainError} Si el mensaje está vacío o excede el límite de caracteres.
   */
  return async function sendMessage({ id, sender, text, channel, createdAt }) {
    if (!text || !text.trim()) {
      throw new DomainError('MESSAGE_EMPTY', 'El mensaje no puede estar vacío.');
    }
    if (text.length > 2000) {
      throw new DomainError('MESSAGE_TOO_LONG', 'El mensaje excede el límite de 2000 caracteres.');
    }
    return messageRepository.saveMessage({ id, sender, text, channel, createdAt });
  };
}
