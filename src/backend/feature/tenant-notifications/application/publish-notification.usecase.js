import { uuidv7 } from '../../../common/id.js';
import { DomainError } from '../../../common/errors.js';

const MAX_TITLE = 200;
const MAX_BODY = 4000;
const VALID_AUDIENCES = new Set(['public', 'authenticated']); // 'segment' → slice 2

/**
 * Publica una notificación de tenant de forma inmediata: persiste `status='published'` con
 * `publishedAt=now` y **difunde** el evento por el canal `notifications_global` para que los
 * clientes suscritos por WebSocket lo reciban al instante.
 *
 * @param {{
 *   notificationRepository: object,
 *   broadcast: (channelName: string, payload: object) => Promise<void>,
 *   tenantId: string,
 *   logger: object,
 *   now?: () => number
 * }} deps
 */
/**
 * @param {Object} deps
 * @param {Object} deps.notificationRepository
 * @param {(channelName: string, payload: Object) => Promise<void>} deps.broadcast
 * @param {string} deps.tenantId
 * @param {Object} deps.logger
 * @param {() => number} [deps.now]
 * @returns {(params: { title: string, body: string, audience?: string, author: { id: string } }) => Promise<{ id: string, title: string, body: string, audience: string, publishedAt: number }>}
 */
export function makePublishNotification({ notificationRepository, broadcast, tenantId, logger, now = () => Date.now() }) {
  /**
   * Publica una notificación de forma inmediata: persiste en DB y difunde por WebSocket.
   * @param {Object} params
   * @param {string} params.title - Título (máx. 200 caracteres).
   * @param {string} params.body - Cuerpo (máx. 4000 caracteres).
   * @param {'public'|'authenticated'} [params.audience='public'] - Audiencia destino.
   * @param {Object} params.author - { id: string } Autor autenticado.
   * @returns {Promise<{ id: string, title: string, body: string, audience: string, publishedAt: number }>}
   * @throws {DomainError} Si title/body están vacíos, exceden límites, audience inválida o falta autor.
   */
  return async function publishNotification({ title, body, audience = 'public', author }) {
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
    const id = uuidv7();
    notificationRepository.insertPublished({
      id, title: normalizedTitle, body: normalizedBody, audience,
      createdBy: author.id, now: ts,
    });

    // La difusión es best-effort: si el broker falla, la notificación queda persistida (los clientes
    // la recuperan vía GET al reconectar). Registramos el error para no ocultar problemas del bus.
    try {
      await broadcast('notifications_global', {
        event: 'notification',
        data: { id, title: normalizedTitle, body: normalizedBody, audience, publishedAt: ts },
      });
    } catch (err) {
      logger.error({ err }, '[notifications] broadcast failed');
    }

    return { id, title: normalizedTitle, body: normalizedBody, audience, publishedAt: ts };
  };
}
