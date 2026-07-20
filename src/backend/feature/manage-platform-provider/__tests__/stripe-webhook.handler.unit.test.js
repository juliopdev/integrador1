import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhookHandler } from '../presentation/routes/stripe-webhook.handler.js';

/**
 * P8.3b: Tests unitarios del webhook handler de Stripe.
 * Mockea Stripe SDK, tenantDbLookup, dispatchEvent y request/reply de Fastify.
 * El handler extraído (`createWebhookHandler`) permite testing sin levantar Fastify completo.
 */

/**
 * Construye mocks de stripe, tenantDbLookup, dispatchEvent y logger.
 * @param {Object} [overrides]
 * @param {Function} [overrides.tenantDbLookup]
 * @param {Function} [overrides.dispatchEvent]
 * @returns {{ stripe: Object, tenantDbLookup: Function, dispatchEvent: Function, logger: Object }}
 */
function buildMocks(overrides = {}) {
  const stripe = {
    webhooks: {
      constructEvent: vi.fn((rawBody, sig, secret) => {
        if (sig === 'valid_sig') {
          return { type: 'checkout.session.completed', data: { object: { id: 'cs_test_123' } } };
        }
        throw new Error('No signatures found matching the expected signature');
      }),
    },
  };

  const tenantDbLookup = overrides.tenantDbLookup ?? vi.fn(() =>
    Promise.resolve({ secretKey: 'sk_test_fake', webhookSecret: 'whsec_test_fake' })
  );

  const dispatchEvent = overrides.dispatchEvent ?? vi.fn(() => Promise.resolve());

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  };

  return { stripe, tenantDbLookup, dispatchEvent, logger };
}

/**
 * Construye un request mock de Fastify para el webhook.
 * @param {Object} [opts]
 * @param {string} [opts.body='{}'] - Cuerpo raw del webhook.
 * @param {Object} [opts.headers] - Headers HTTP.
 * @param {Object} [opts.params] - Parámetros de ruta.
 * @returns {Object} Request mockeado.
 */
function buildRequest({ body = '{}', headers = {}, params = {} } = {}) {
  const chunks = [Buffer.from(body)];
  let consumed = false;
  return {
    params: { tenantId: 't1', ...params },
    headers: { ...headers },
    raw: {
      on(event, cb) {
        if (event === 'data' && !consumed) {
          for (const c of chunks) cb(c);
          consumed = true;
        }
        if (event === 'end' && consumed) cb();
        if (event === 'error') { /* noop */ }
      },
    },
  };
}

/**
 * Construye un reply mock de Fastify que captura statusCode y body.
 * @returns {Object} Reply mockeado con _code y _body.
 */
function buildReply() {
  const reply = {
    _code: 200,
    _body: null,
    code(c) { reply._code = c; return reply; },
    send(body) { reply._body = body; return reply; },
  };
  return reply;
}

describe('stripe-webhook.handler — createWebhookHandler', () => {
  let handler;

  beforeEach(() => {
    const { stripe, tenantDbLookup, dispatchEvent, logger } = buildMocks();
    handler = createWebhookHandler({ stripe, tenantDbLookup, dispatchEvent, logger });
  });

  it('tenant sin config Stripe → 400 WEBHOOK_TENANT_NOT_CONFIGURED', async () => {
    const { stripe, logger } = buildMocks();
    const lookup = vi.fn(() => Promise.resolve(null));
    const h = createWebhookHandler({ stripe, tenantDbLookup: lookup, dispatchEvent: vi.fn(), logger });
    const reply = buildReply();
    await h(buildRequest(), reply);
    expect(reply._code).toBe(400);
    expect(reply._body.code).toBe('WEBHOOK_TENANT_NOT_CONFIGURED');
  });

  it('sin header stripe-signature → 400 WEBHOOK_MISSING_SIGNATURE', async () => {
    const reply = buildReply();
    await handler(buildRequest({ headers: {} }), reply);
    expect(reply._code).toBe(400);
    expect(reply._body.code).toBe('WEBHOOK_MISSING_SIGNATURE');
  });

  it('firma inválida → 400 WEBHOOK_INVALID_SIGNATURE', async () => {
    const { stripe, logger } = buildMocks();
    stripe.webhooks.constructEvent = vi.fn(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    const h = createWebhookHandler({ stripe, tenantDbLookup: vi.fn(() => Promise.resolve({ webhookSecret: 'whsec_fake' })), dispatchEvent: vi.fn(), logger });
    const reply = buildReply();
    await h(buildRequest({ headers: { 'stripe-signature': 'bad_sig' } }), reply);
    expect(reply._code).toBe(400);
    expect(reply._body.code).toBe('WEBHOOK_INVALID_SIGNATURE');
  });

  it('firma válida + evento checkout.session.completed → 200 { received: true }', async () => {
    const { dispatchEvent, logger } = buildMocks();
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => ({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_123' } } })),
      },
    };
    const h = createWebhookHandler({ stripe, tenantDbLookup: vi.fn(() => Promise.resolve({ webhookSecret: 'whsec_test' })), dispatchEvent, logger });
    const reply = buildReply();
    await h(buildRequest({ headers: { 'stripe-signature': 'valid_sig' } }), reply);
    expect(reply._code).toBe(200);
    expect(reply._body).toEqual({ received: true });
    expect(dispatchEvent).toHaveBeenCalledWith(
      { type: 'checkout.session.completed', data: { object: { id: 'cs_test_123' } } },
      { logger },
    );
  });

  it('firma válida + evento payment_intent.succeeded → dispatch y 200', async () => {
    const { dispatchEvent, logger } = buildMocks();
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => ({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_abc' } } })),
      },
    };
    const h = createWebhookHandler({ stripe, tenantDbLookup: vi.fn(() => Promise.resolve({ webhookSecret: 'whsec_test' })), dispatchEvent, logger });
    const reply = buildReply();
    await h(buildRequest({ headers: { 'stripe-signature': 'valid_sig' } }), reply);
    expect(reply._code).toBe(200);
    expect(dispatchEvent).toHaveBeenCalledWith(
      { type: 'payment_intent.succeeded', data: { object: { id: 'pi_abc' } } },
      { logger },
    );
  });

  it('firma válida + evento payment_intent.payment_failed → dispatch y 200', async () => {
    const { dispatchEvent, logger } = buildMocks();
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => ({ type: 'payment_intent.payment_failed', data: { object: { id: 'pi_fail' } } })),
      },
    };
    const h = createWebhookHandler({ stripe, tenantDbLookup: vi.fn(() => Promise.resolve({ webhookSecret: 'whsec_test' })), dispatchEvent, logger });
    const reply = buildReply();
    await h(buildRequest({ headers: { 'stripe-signature': 'valid_sig' } }), reply);
    expect(reply._code).toBe(200);
    expect(dispatchEvent).toHaveBeenCalledWith(
      { type: 'payment_intent.payment_failed', data: { object: { id: 'pi_fail' } } },
      { logger },
    );
  });

  it('evento desconocido → 200 (ack silencioso, dispatch igual se llama)', async () => {
    const { dispatchEvent, logger } = buildMocks();
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => ({ type: 'invoice.paid', data: { object: { id: 'in_123' } } })),
      },
    };
    const h = createWebhookHandler({ stripe, tenantDbLookup: vi.fn(() => Promise.resolve({ webhookSecret: 'whsec_test' })), dispatchEvent, logger });
    const reply = buildReply();
    await h(buildRequest({ headers: { 'stripe-signature': 'valid_sig' } }), reply);
    expect(reply._code).toBe(200);
    expect(dispatchEvent).toHaveBeenCalled();
  });

  it('constructEvent lanza error genérico → 400 WEBHOOK_INVALID_SIGNATURE', async () => {
    const { logger } = buildMocks();
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => { throw new Error('webhook secret mismatch'); }),
      },
    };
    const h = createWebhookHandler({ stripe, tenantDbLookup: vi.fn(() => Promise.resolve({ webhookSecret: 'whsec_test' })), dispatchEvent: vi.fn(), logger });
    const reply = buildReply();
    await h(buildRequest({ headers: { 'stripe-signature': 'valid_sig' } }), reply);
    expect(reply._code).toBe(400);
    expect(reply._body.code).toBe('WEBHOOK_INVALID_SIGNATURE');
  });
});
