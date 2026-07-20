/**
 * Lista notificaciones programadas del tenant (Master view). Ordenadas por `scheduledAt ASC`
 * (la próxima primero). Sin filtro de audience — el Master ve todas las suyas.
 *
 * @param {{ notificationRepository: object }} deps
 */
/**
 * @param {Object} deps
 * @param {Object} deps.notificationRepository
 * @returns {({ limit?: number, offset?: number } | undefined) => Promise<Array<Object>>}
 */
export function makeGetScheduledNotifications({ notificationRepository }) {
  /**
   * Lista notificaciones programadas ordenadas por scheduledAt ASC (próxima primero).
   * @param {Object} [opts={}]
   * @param {number|string} [opts.limit] - Máx. registros (clamp 1-200, default 50).
   * @param {number|string} [opts.offset] - Desplazamiento (default 0).
   * @returns {Promise<Array<{ id: string, title: string, body: string, audience: string, scheduledAt: number, createdBy: string }>>}
   */
  return async function getScheduled({ limit, offset } = {}) {
    const safeLimit = clamp(parseInt(limit, 10) || 50, 1, 200);
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
    return notificationRepository.listScheduled({ limit: safeLimit, offset: safeOffset });
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
