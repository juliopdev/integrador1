/**
 * Feed público de notificaciones ya publicadas. La visibilidad depende del scope del cliente:
 * - Anónimo: sólo `public`.
 * - Autenticado (scope='user' del tenant): `public` + `authenticated`.
 * - `segment` queda excluido hasta el slice 2 (política + persistencia del segmentJson).
 *
 * Paginación por `limit`/`offset` clampada a rangos razonables.
 *
 * @param {{ notificationRepository: object }} deps
 */
/**
 * @param {Object} deps
 * @param {Object} deps.notificationRepository
 * @returns {({ isAuthenticated?: boolean, limit?: number, offset?: number } | undefined) => Promise<Array<Object>>}
 */
export function makeGetLatestPublishedNotifications({ notificationRepository }) {
  /**
   * Retorna el feed de notificaciones publicadas, filtrado por audiencia según
   * si el solicitante está autenticado o no.
   * @param {Object} [opts={}]
   * @param {boolean} [opts.isAuthenticated=false] - Si es true, incluye audience 'authenticated'.
   * @param {number|string} [opts.limit] - Máx. registros (clamp 1-100, default 20).
   * @param {number|string} [opts.offset] - Desplazamiento (default 0).
   * @returns {Promise<Array<{ id: string, title: string, body: string, audience: string, publishedAt: number }>>}
   */
  return async function getLatest({ isAuthenticated = false, limit, offset } = {}) {
    const visibleAudiences = isAuthenticated ? ['public', 'authenticated'] : ['public'];
    const safeLimit = clamp(parseInt(limit, 10) || 20, 1, 100);
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
    return notificationRepository.listPublished({
      visibleAudiences,
      limit: safeLimit,
      offset: safeOffset,
    });
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
