import { uuidv7 } from '../../../common/id.js';
import { DomainError } from '../../../common/errors.js';

const MAX_TITLE = 200;
const MAX_BODY = 4000;
const VALID_AUDIENCES = new Set(['public', 'authenticated']);

/**
 * Programa una notificación para envío futuro:
 * - Persiste en `notifications` con `status='scheduled'`, `scheduledAt=<future>`.
 * - Encola un job `notification.dispatch` en la cola global (`platform.db.jobs`) con
 *   `available_at = scheduledAt`. Usa `job.id === notification.id` para que la cancelación /
 *   re-agendado localicen el job sin buscar por payload.
 *
 * El worker (`worker.js`) toma el job a su hora, publica la notificación (transición scheduled→
 * published) y la difunde por WS. Ver `dispatch-notification.handler.js`.
 *
 * @param {{
 *   notificationRepository: object,
 *   jobQueue: { enqueue: Function },
 *   tenantId: string,
 *   now?: () => number
 * }} deps
 */
/**
 * @param {Object} deps
 * @param {Object} deps.notificationRepository
 * @param {{ enqueue: Function }} deps.jobQueue
 * @param {string} deps.tenantId
 * @param {() => number} [deps.now]
 * @returns {(params: { title: string, body: string, audience?: string, scheduledAt: number, author: { id: string } }) => Promise<{ id: string, title: string, body: string, audience: string, scheduledAt: number, status: string }>}
 */
export function makeScheduleNotification({ notificationRepository, jobQueue, tenantId, now = () => Date.now() }) {
  /**
   * Programa una notificación para envío futuro: persiste como 'scheduled' y encola job
   * en platform.db.jobs con id = notification.id.
   * @param {Object} params
   * @param {string} params.title - Título (máx. 200 caracteres).
   * @param {string} params.body - Cuerpo (máx. 4000 caracteres).
   * @param {'public'|'authenticated'} [params.audience='public'] - Audiencia destino.
   * @param {number} params.scheduledAt - Timestamp ms futuro para la publicación.
   * @param {Object} params.author - { id: string } Autor autenticado.
   * @returns {Promise<{ id: string, title: string, body: string, audience: string, scheduledAt: number, status: string }>}
   * @throws {DomainError} Si title/body vacíos, exceden límites, audience inválida,
   *   falta autor o scheduledAt no es futuro.
   */
  return async function scheduleNotification({ title, body, audience = 'public', scheduledAt, author }) {
    const normalizedTitle = String(title ?? '').trim();
    const normalizedBody = String(body ?? '').trim();
    if (!normalizedTitle) throw new DomainError('VALIDATION_ERROR', 'El título es requerido.');
    if (!normalizedBody) throw new DomainError('VALIDATION_ERROR', 'El cuerpo es requerido.');
    if (normalizedTitle.length > MAX_TITLE) throw new DomainError('VALIDATION_ERROR', `El título excede ${MAX_TITLE} caracteres.`);
    if (normalizedBody.length > MAX_BODY) throw new DomainError('VALIDATION_ERROR', `El cuerpo excede ${MAX_BODY} caracteres.`);
    if (!VALID_AUDIENCES.has(audience)) {
      throw new DomainError('VALIDATION_ERROR', `Audience inválida (permitidas: ${[...VALID_AUDIENCES].join(', ')}).`);
    }
    if (!author?.id) throw new DomainError('VALIDATION_ERROR', 'Requiere un autor autenticado.');

    const ts = now();
    const scheduledAtMs = Number(scheduledAt);
    if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= ts) {
      throw new DomainError('VALIDATION_ERROR', 'scheduledAt debe ser un timestamp futuro en ms.');
    }

    const id = uuidv7();
    notificationRepository.insertScheduled({
      id, title: normalizedTitle, body: normalizedBody, audience,
      scheduledAt: scheduledAtMs,
      createdBy: author.id, now: ts,
    });

    // `id` del job === id de la notificación → cancel/reschedule son O(1) sin escaneo del payload.
    jobQueue.enqueue('notification.dispatch', {
      id,
      tenantId,
      payload: { tenantId, notificationId: id },
      availableAt: scheduledAtMs,
    });

    return { id, title: normalizedTitle, body: normalizedBody, audience, scheduledAt: scheduledAtMs, status: 'scheduled' };
  };
}
