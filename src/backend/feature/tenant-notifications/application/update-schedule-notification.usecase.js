import { DomainError, NotFoundError } from '../../../common/errors.js';

const MAX_TITLE = 200;
const MAX_BODY = 4000;
const VALID_AUDIENCES = new Set(['public', 'authenticated']);

/**
 * Edita una notificación programada:
 * - Todos los campos son opcionales (patch parcial): sólo se toca lo enviado.
 * - Si viene `scheduledAt`, debe ser futuro y se re-agenda el job (mismo `id`, sólo cambia
 *   `available_at`) para no perder la referencia.
 * - Falla si la notificación no existe o su status ya no es `scheduled` (fue publicada o
 *   cancelada) — no reabrimos el ciclo desde el patch.
 *
 * @param {{
 *   notificationRepository: object,
 *   jobQueue: { updateAvailableAt: Function },
 *   now?: () => number,
 * }} deps
 */
/**
 * @param {Object} deps
 * @param {Object} deps.notificationRepository
 * @param {{ updateAvailableAt: Function }} deps.jobQueue
 * @param {() => number} [deps.now]
 * @returns {(params: { id: string, patch: Object }) => Promise<Object>}
 */
export function makeUpdateScheduleNotification({ notificationRepository, jobQueue, now = () => Date.now() }) {
  /**
   * Edita parcialmente una notificación programada. Si cambia scheduledAt, re-agenda
   * el job asociado. Falla si la notificación ya fue publicada o cancelada.
   * @param {Object} params
   * @param {string} params.id - ID de la notificación.
   * @param {Object} params.patch - Campos a actualizar (title/body/audience/scheduledAt).
   * @returns {Promise<Object>} Notificación actualizada.
   * @throws {NotFoundError} Si la notificación no existe o ya no está programada.
   * @throws {DomainError} Si algún campo falla validación.
   */
  return async function updateSchedule({ id, patch }) {
    if (!id) throw new DomainError('VALIDATION_ERROR', 'id es requerido.');
    const existing = notificationRepository.findScheduledById(id);
    if (!existing) throw new NotFoundError('NOTIFICATION_NOT_FOUND', 'La notificación programada no existe.');

    const clean = {};

    if (patch.title != null) {
      const t = String(patch.title).trim();
      if (!t) throw new DomainError('VALIDATION_ERROR', 'El título no puede quedar vacío.');
      if (t.length > MAX_TITLE) throw new DomainError('VALIDATION_ERROR', `El título excede ${MAX_TITLE} caracteres.`);
      clean.title = t;
    }
    if (patch.body != null) {
      const b = String(patch.body).trim();
      if (!b) throw new DomainError('VALIDATION_ERROR', 'El cuerpo no puede quedar vacío.');
      if (b.length > MAX_BODY) throw new DomainError('VALIDATION_ERROR', `El cuerpo excede ${MAX_BODY} caracteres.`);
      clean.body = b;
    }
    if (patch.audience != null) {
      if (!VALID_AUDIENCES.has(patch.audience)) {
        throw new DomainError('VALIDATION_ERROR', `Audience inválida (permitidas: ${[...VALID_AUDIENCES].join(', ')}).`);
      }
      clean.audience = patch.audience;
    }
    if (patch.scheduledAt != null) {
      const at = Number(patch.scheduledAt);
      if (!Number.isFinite(at) || at <= now()) {
        throw new DomainError('VALIDATION_ERROR', 'scheduledAt debe ser un timestamp futuro en ms.');
      }
      clean.scheduledAt = at;
    }

    if (Object.keys(clean).length === 0) return existing;

    const ts = now();
    const ok = notificationRepository.updateScheduled({ id, patch: clean, now: ts });
    if (!ok) {
      // Race: alguien la publicó/canceló entre findScheduledById y este update — abortamos.
      throw new NotFoundError('NOTIFICATION_NOT_FOUND', 'La notificación ya no está programada.');
    }
    // Si movimos la hora, re-agendamos el job (mismo id de notificación === id del job).
    if (clean.scheduledAt != null) {
      jobQueue.updateAvailableAt(id, clean.scheduledAt);
    }
    return { ...existing, ...clean };
  };
}
