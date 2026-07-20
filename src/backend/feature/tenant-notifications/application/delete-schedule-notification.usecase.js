import { NotFoundError } from '../../../common/errors.js';

/**
 * Cancela una notificación programada:
 * - Marca `status='canceled'` en `notifications` (persistencia de la decisión — audit trail).
 * - Elimina el job pendiente en `platform.db.jobs` (mismo `id` que la notificación). Si el worker
 *   ya lo tomó, el `cancelPending` es no-op — el handler detectará el status y no publicará.
 *
 * @param {{ notificationRepository: object, jobQueue: { cancelPending: Function }, now?: () => number }} deps
 */
/**
 * @param {Object} deps
 * @param {Object} deps.notificationRepository
 * @param {{ cancelPending: Function }} deps.jobQueue
 * @param {() => number} [deps.now]
 * @returns {(params: { id: string }) => Promise<{ id: string, canceled: boolean }>}
 */
export function makeDeleteScheduleNotification({ notificationRepository, jobQueue, now = () => Date.now() }) {
  /**
   * Cancela una notificación programada: marca status='canceled' y elimina el job pendiente.
   * @param {Object} params
   * @param {string} params.id - ID de la notificación a cancelar.
   * @returns {Promise<{ id: string, canceled: boolean }>}
   * @throws {NotFoundError} Si la notificación no existe o ya no está programada.
   */
  return async function deleteSchedule({ id }) {
    if (!id) throw new NotFoundError('NOTIFICATION_NOT_FOUND', 'La notificación programada no existe.');
    const ok = notificationRepository.cancelScheduled({ id, now: now() });
    if (!ok) {
      throw new NotFoundError('NOTIFICATION_NOT_FOUND', 'La notificación programada no existe o ya no está pendiente.');
    }
    jobQueue.cancelPending(id);
    return { id, canceled: true };
  };
}
