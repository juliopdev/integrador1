import { z } from 'zod';

/**
 * Query params para listado de mensajes de chat.
 * @typedef {Object} ChatMessagesQuery
 * @property {string} channel - Canal de chat.
 * @property {number} [limit=50] - Máx. mensajes (1-200).
 * @property {number} [offset=0] - Desplazamiento.
 */
export const chatMessagesQuerySchema = z.object({
  channel: z.string().min(1, 'El canal es requerido.'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
