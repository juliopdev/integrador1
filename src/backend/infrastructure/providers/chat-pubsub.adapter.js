import { env } from '../../config/env.js';
import { valkey } from './cache-core.adapter.js';
import { logger } from './logger.js';
import { AppError } from '../../common/errors.js';

const Redis = env.NODE_ENV === 'test'
  ? (await import('ioredis-mock')).default
  : (await import('ioredis')).default;

let valkeySub = null;
let controlEventHandler = null;
const localSubscriptions = new Map(); // valkeyChannel -> Set<WebSocket>

/**
 * Registra un callback para manejar los eventos globales de control publicados en el canal `ws:control`.
 *
 * @param {Function} handler - Función que recibirá los eventos de control parseados.
 */
export function onControlEvent(handler) {
  controlEventHandler = handler;
}

/**
 * Inicializa el cliente de suscripción exclusivo de Valkey y lo vincula
 * al ciclo de vida de Fastify para su apagado ordenado.
 * Solo debe llamarse una vez; las llamadas subsecuentes son no-op.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify para registrar el hook `onClose`.
 */
export function initPubSub(app) {
  if (valkeySub) return;

  valkeySub = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  // Suscribimos en `ready` — no `connect` — para evitar el race del ready-check interno de ioredis
  // (`INFO`/`PING` post-connect). Si suscribimos en `connect`, la conexión pasa a modo subscriber
  // mientras ioredis todavía manda comandos normales del ready-check → error "only subscriber
  // commands allowed" → reconexión → loop cada segundo en dev. `ready` fires una vez el ready-check
  // terminó, así ya podemos entrar seguros al subscriber mode.
  valkeySub.on('ready', async () => {
    if (env.NODE_ENV !== 'test') {
      logger.info('[valkey-sub] conectado');
    }
    await valkeySub.subscribe('ws:control').catch((err) => {
      logger.error({ err }, '[valkey-sub] error al suscribir a ws:control');
    });
  });

  valkeySub.on('error', (err) => {
    logger.error({ err }, '[valkey-sub] error');
  });

  valkeySub.on('message', (valkeyChannel, rawMessage) => {
    if (valkeyChannel === 'ws:control') {
      try {
        const event = JSON.parse(rawMessage);
        if (controlEventHandler) {
          controlEventHandler(event);
        }
      } catch (err) {
        logger.error({ err }, '[valkey-sub] error al procesar mensaje de control');
      }
      return;
    }

    const sockets = localSubscriptions.get(valkeyChannel);
    if (sockets) {
      for (const socket of sockets) {
        try {
          socket.send(rawMessage);
        } catch {
          // Socket cerrado antes de enviar; se limpia en su evento close.
        }
      }
    }
  });

  app.addHook('onClose', async () => {
    if (valkeySub) {
      await valkeySub.quit().catch(() => {});
      valkeySub = null;
    }
  });
}

/**
 * Suscribe un WebSocket local a un canal del tenant, y gatilla la
 * suscripción física a Valkey si es el primer oyente local de ese canal.
 *
 * @param {string} tenantId - ID del tenant.
 * @param {string} channelName - Nombre del canal (sin prefijo).
 * @param {import('ws').WebSocket} socket - Conexión WebSocket a suscribir.
 * @throws {AppError} Si el adapter Pub/Sub no ha sido inicializado con `initPubSub`.
 */
export async function subscribeLocal(tenantId, channelName, socket) {
  if (!valkeySub) throw new AppError(503, 'PUBSUB_NOT_INITIALIZED', 'Pub/Sub adapter no inicializado. Llama a initPubSub primero.');
  const valkeyChannel = `ws:tenant:${tenantId}:channel:${channelName}`;
  if (!localSubscriptions.has(valkeyChannel)) {
    localSubscriptions.set(valkeyChannel, new Set());
    await valkeySub.subscribe(valkeyChannel);
  }
  localSubscriptions.get(valkeyChannel).add(socket);
}

/**
 * Desuscribe un WebSocket local de un canal del tenant, y libera la suscripción
 * en Valkey si no quedan oyentes locales.
 *
 * @param {string} tenantId - ID del tenant.
 * @param {string} channelName - Nombre del canal (sin prefijo).
 * @param {import('ws').WebSocket} socket - Conexión WebSocket a desuscribir.
 */
export async function unsubscribeLocal(tenantId, channelName, socket) {
  if (!valkeySub) return;
  const valkeyChannel = `ws:tenant:${tenantId}:channel:${channelName}`;
  const set = localSubscriptions.get(valkeyChannel);
  if (set) {
    set.delete(socket);
    if (set.size === 0) {
      localSubscriptions.delete(valkeyChannel);
      await valkeySub.unsubscribe(valkeyChannel).catch(() => {});
    }
  }
}

/**
 * Publica un mensaje en un canal Valkey para propagarlo a todas las instancias
 * del clúster del servidor (cross-instance broadcast).
 *
 * @param {string} tenantId - ID del tenant.
 * @param {string} channelName - Nombre del canal (sin prefijo).
 * @param {*} message - Mensaje a publicar (se serializa a JSON automáticamente).
 */
export async function publishMessage(tenantId, channelName, message) {
  const valkeyChannel = `ws:tenant:${tenantId}:channel:${channelName}`;
  await valkey.publish(valkeyChannel, JSON.stringify(message));
}
