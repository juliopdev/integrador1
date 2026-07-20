import { collectDefaultMetrics, register } from 'prom-client';
import { env } from '../../config/env.js';

let defaultsStarted = false;

/**
 * Instrumenta métricas por defecto (prom-client) y expone el endpoint configurado en `env.METRICS_PATH`.
 * Solo se activa si `env.METRICS_ENABLED` es verdadero.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 */
export async function registerMetrics(app) {
  if (!env.METRICS_ENABLED) return;
  if (!defaultsStarted) {
    collectDefaultMetrics();
    defaultsStarted = true;
  }
  app.get(env.METRICS_PATH, async (request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });
}
