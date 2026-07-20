import { AppError } from '../../../common/errors.js';

/**
 * Handler del worker para el job `notification.dispatch`. Corre en el proceso del `worker.js`,
 * NO en el servidor HTTP — por eso construye el repo per-invocación con la conexión abierta al
 * `tenant.db` de turno.
 *
 * Flujo:
 * 1. Wrappea la conexión del `tenantPool` con drizzle → construye el repo.
 * 2. `markPublished` transiciona status 'scheduled' → 'published'. Idempotente: si el status ya
 *    cambió (cancel entre encolado y toma del job, o retry duplicado), retorna `null` y salimos.
 * 3. Difunde el evento por `notifications_global` del tenant vía Valkey pub-sub para que los
 *    clientes suscritos por WS lo reciban al instante. Best-effort: si el broker falla, la fila
 *    quedó publicada — los clientes la reciben al hacer polling del feed.
 *
 * Errores propagados hacia el worker → retry con backoff (hasta `max_attempts`).
 *
 * @param {{
 *   createNotificationRepository: (deps: { db: object }) => object,
 *   getTenantDb: (tenantId: string) => object,
 *   broadcastFor: (tenantId: string) => (channelName: string, payload: object) => Promise<void>,
 *   logger: object,
 *   now?: () => number,
 * }} deps
 */
/**
 * @param {Object} deps
 * @param {Function} deps.createNotificationRepository
 * @param {(tenantId: string) => Object} deps.getTenantDb
 * @param {(tenantId: string) => (channelName: string, payload: Object) => Promise<void>} deps.broadcastFor
 * @param {Object} deps.logger
 * @param {() => number} [deps.now]
 * @returns {(params: { tenantId: string, notificationId: string }) => Promise<{ skipped?: boolean, reason?: string, published?: boolean, id?: string }>}
 */
export function makeDispatchScheduledNotification({ createNotificationRepository, getTenantDb, broadcastFor, logger, now = () => Date.now() }) {
  /**
   * Handler del worker para el job notification.dispatch. Transiciona la notificación
   * de 'scheduled' → 'published' y difunde por WS. Idempotente: si el status ya cambió,
   * retorna { skipped: true }.
   * @param {Object} params
   * @param {string} params.tenantId - ID del tenant.
   * @param {string} params.notificationId - ID de la notificación a publicar.
   * @returns {Promise<{ skipped?: boolean, reason?: string, published?: boolean, id?: string }>}
   * @throws {AppError} Si faltan tenantId o notificationId en el payload.
   */
  return async function dispatch({ tenantId, notificationId }) {
    if (!tenantId || !notificationId) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Falta tenantId o notificationId en el payload.');
    }
    const db = getTenantDb(tenantId);
    const repo = createNotificationRepository({ db });
    const published = repo.markPublished({ id: notificationId, now: now() });
    if (!published) return { skipped: true, reason: 'not_scheduled' }; // cancel o duplicate retry

    try {
      await broadcastFor(tenantId)('notifications_global', {
        event: 'notification',
        data: published,
      });
    } catch (err) {
      logger.error({ err, tenantId, notificationId }, '[notifications] broadcast failed');
    }
    return { published: true, id: notificationId };
  };
}
