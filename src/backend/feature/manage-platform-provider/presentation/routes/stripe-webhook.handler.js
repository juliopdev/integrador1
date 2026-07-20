import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { tenantProviders } from '../../../../config/drizzle/schema-tenant.js';
import { tenantPool } from '../../../../config/database/connection-pool/lru-manager.js';
import { decrypt } from '../../../../common/crypto.js';
import { errorBody } from '../../../../common/responses.js';

/**
 * Lee el body completo de un `IncomingMessage` como Buffer.
 * Fastify con `bodyParser: false` no parsea el payload — el stream queda disponible en
 * `request.raw` para que lo leamos manualmente. Esto preserva los bytes exactos que Stripe
 * necesita para verificar la firma.
 */
function collectRawBody(raw) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    raw.on('data', (chunk) => chunks.push(chunk));
    raw.on('end', () => resolve(Buffer.concat(chunks)));
    raw.on('error', reject);
  });
}

/**
 * Resuelve la config desencriptada de Stripe para un tenant dado.
 * Busca la fila en `tenant_providers` con category='payments' AND provider='stripe',
 * desencripta `config_values_json` y devuelve el objeto de config plano.
 *
 * @param {string} tenantId
 * @returns {Promise<{ secretKey: string, webhookSecret: string } | null>}
 */
async function getStripeConfig(tenantId) {
  const db = drizzle(tenantPool.get(tenantId));
  const row = db
    .select({ configValuesJson: tenantProviders.configValuesJson })
    .from(tenantProviders)
    .where(and(eq(tenantProviders.category, 'payments'), eq(tenantProviders.provider, 'stripe'), eq(tenantProviders.enabled, 1)))
    .limit(1)
    .all()[0];
  if (!row) return null;
  try {
    return JSON.parse(decrypt(JSON.parse(row.configValuesJson)));
  } catch {
    return null;
  }
}

/**
 * Despacha un evento de Stripe verificado al handler apropiado.
 * Hoy maneja los eventos del POC (checkout + payment_intent). Eventos no reconocidos se
 * acksilenciosamente (200 OK) — Stripe reintenta eventos no resueltos, pero aquí "resuelto"
 * significa "lo recibimos y no nos importa aún".
 *
 * @param {{ type: string, data: { object: any } }} event
 * @param {object} ctx
 * @param {Function} ctx.logger
 * @returns {Promise<void>}
 */
async function dispatchEvent(event, { logger }) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      logger.info({ sessionId: session.id, customerId: session.customer }, '[stripe-webhook] checkout completed');
      // TODO P8.3c: actualizar estado del pedido en la tabla dinámica `orders`
      break;
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      logger.info({ paymentIntentId: pi.id, amount: pi.amount }, '[stripe-webhook] payment succeeded');
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      logger.warn({ paymentIntentId: pi.id, error: pi.last_payment_error?.message }, '[stripe-webhook] payment failed');
      break;
    }
    default:
      logger.debug({ eventType: event.type }, '[stripe-webhook] evento no procesado (ack silencioso)');
  }
}

/**
 * Crea el handler del webhook de Stripe como un cierre sobre sus dependencias inyectadas.
 * Extraído como factory para permitir testing unitario sin levantar Fastify completo.
 *
 * @param {{ stripe: Stripe, tenantDbLookup: Function, dispatchEvent: Function, logger: object }} deps
 * @returns {Function} Handler async (request, reply) → reply
 */
export function createWebhookHandler({ stripe, tenantDbLookup, dispatchEvent: dispatch, logger }) {
  return async (request, reply) => {
    const { tenantId } = request.params;

    let rawBody;
    try {
      rawBody = await collectRawBody(request.raw);
    } catch {
      return reply.code(400).send(errorBody(400, 'WEBHOOK_RAW_BODY_ERROR', 'No se pudo leer el body del webhook.'));
    }

    const stripeConfig = await tenantDbLookup(tenantId);
    if (!stripeConfig) {
      return reply.code(400).send(errorBody(400, 'WEBHOOK_TENANT_NOT_CONFIGURED', 'Stripe no está configurado para este tenant.'));
    }

    const signature = request.headers['stripe-signature'];
    if (!signature) {
      return reply.code(400).send(errorBody(400, 'WEBHOOK_MISSING_SIGNATURE', 'Falta la cabecera stripe-signature.'));
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, stripeConfig.webhookSecret);
    } catch (err) {
      logger.warn({ err, tenantId }, '[stripe-webhook] firma inválida');
      return reply.code(400).send(errorBody(400, 'WEBHOOK_INVALID_SIGNATURE', 'La firma del webhook no es válida.'));
    }

    await dispatch(event, { logger });
    return reply.code(200).send({ received: true });
  };
}

/**
 * Registra la ruta del webhook de Stripe en la instancia de Fastify.
 *
 * DEBE registrarse ANTES de `registerSessionAuth(app)` para que el hook `preValidation`
 * de sesión NO se aplique a esta ruta — el webhook es invocado por los servidores de Stripe,
 * no por un usuario autenticado. La autenticación se hace via firma HMAC del body.
 *
 * La ruta usa `bodyParser: false` para preservar los bytes raw del body (necesario para la
 * verificación de firma de Stripe). El body se lee manualmente de `request.raw`.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ logger: object }} deps
 */
export function registerStripeWebhookRoute(app, { logger }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

  const handler = createWebhookHandler({
    stripe,
    tenantDbLookup: getStripeConfig,
    dispatchEvent,
    logger,
  });

  app.post('/webhooks/stripe/:tenantId', { bodyParser: false }, handler);
}
