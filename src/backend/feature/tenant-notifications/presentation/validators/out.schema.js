import { z } from 'zod';

/**
 * Shape público de una notificación publicada. NO expone `createdBy` (staff internal),
 * `status`, `scheduledAt`, `segmentJson` — sólo lo que necesita el feed del end-user.
 * @typedef {Object} NotificationPublicDTO
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {'public'|'authenticated'} audience
 * @property {number} publishedAt
 */
export const notificationPublicSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  audience: z.enum(['public', 'authenticated']),
  publishedAt: z.number(),
});

export const notificationListSchema = z.array(notificationPublicSchema);

/**
 * Shape interno para Master (listado de scheduled) — incluye scheduledAt + createdBy.
 * @typedef {Object} NotificationScheduledDTO
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {'public'|'authenticated'} audience
 * @property {number} scheduledAt
 * @property {string} createdBy
 * @property {'scheduled'|'published'|'canceled'} [status]
 */
export const notificationScheduledSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  audience: z.enum(['public', 'authenticated']),
  scheduledAt: z.number(),
  createdBy: z.string(),
  status: z.enum(['scheduled', 'published', 'canceled']).optional(),
});

export const notificationScheduledListSchema = z.array(notificationScheduledSchema);

/**
 * Respuesta de creación (publish inmediato o schedule) — devuelve el shape más completo.
 * @typedef {Object} NotificationCreateResult
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {'public'|'authenticated'} audience
 * @property {'scheduled'|'published'} [status]
 * @property {number} [publishedAt]
 * @property {number} [scheduledAt]
 */
export const notificationCreateResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  audience: z.enum(['public', 'authenticated']),
  status: z.enum(['scheduled', 'published']).optional(),
  publishedAt: z.number().optional(),
  scheduledAt: z.number().optional(),
});

/**
 * Respuesta de cancelación de una notificación programada.
 * @typedef {Object} NotificationCancelResult
 * @property {string} id
 * @property {boolean} canceled
 */
export const notificationCancelResultSchema = z.object({
  id: z.string(),
  canceled: z.boolean(),
});
