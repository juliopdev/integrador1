import { z } from 'zod';

// Acepta 3 formas de scheduledAt:
// - number: ms epoch (payloads JSON de integraciones)
// - numeric string: idem, viene por `FormData`
// - ISO / datetime-local: string parseable por Date (el input `datetime-local` del form Master
//   emite "YYYY-MM-DDTHH:mm" que `new Date()` interpreta como local time).
const scheduledAtField = z.union([z.string(), z.number()]).transform((v) => {
  if (typeof v === 'number') return v;
  const asNumber = Number(v);
  if (Number.isFinite(asNumber) && String(asNumber) === String(v).trim()) return asNumber;
  const parsed = new Date(v).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}).refine((n) => Number.isFinite(n), 'scheduledAt debe ser un timestamp ms o una fecha ISO/datetime-local válida.');

/**
 * Esquema de creación de notificación: si trae `scheduledAt` → schedule; sino → publish inmediato.
 * @typedef {Object} PublishInput
 * @property {string} title - Título (1-200 caracteres).
 * @property {string} body - Cuerpo (1-4000 caracteres).
 * @property {'public'|'authenticated'} [audience='public'] - Audiencia destino.
 * @property {number|string} [scheduledAt] - Timestamp ms o ISO para programación futura.
 */
export const publishSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  audience: z.enum(['public', 'authenticated']).default('public'),
  scheduledAt: scheduledAtField.optional(),
});

/**
 * Patch parcial de una notificación programada — todos los campos son opcionales.
 * @typedef {Object} UpdateScheduleInput
 * @property {string} [title]
 * @property {string} [body]
 * @property {'public'|'authenticated'} [audience]
 * @property {number|string} [scheduledAt]
 */
export const updateScheduleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(4000).optional(),
  audience: z.enum(['public', 'authenticated']).optional(),
  scheduledAt: scheduledAtField.optional(),
});

/**
 * Paginación del feed público / listado de scheduled. Limit clampado en el use case.
 * @typedef {Object} ListQuery
 * @property {string|number} [limit]
 * @property {string|number} [offset]
 */
export const listQuerySchema = z.object({
  limit: z.union([z.string(), z.number()]).optional(),
  offset: z.union([z.string(), z.number()]).optional(),
});
