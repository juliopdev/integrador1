import { z } from 'zod';

/**
 * Mensaje individual del chat de soporte.
 * @typedef {Object} ChatMessageDTO
 * @property {string} id
 * @property {string} sender
 * @property {string} text
 * @property {string} channel
 * @property {number} createdAt
 */
export const chatMessageSchema = z.object({
  id: z.string(),
  sender: z.string(),
  text: z.string(),
  channel: z.string(),
  createdAt: z.number(),
});

/**
 * Respuesta de listado de mensajes de chat (con paginación).
 * @typedef {Object} ChatMessagesResult
 * @property {ChatMessageDTO[]} messages
 * @property {{ limit: number, offset: number }} pagination
 */
export const chatMessagesResultSchema = z.object({
  messages: z.array(chatMessageSchema),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
  }),
});
