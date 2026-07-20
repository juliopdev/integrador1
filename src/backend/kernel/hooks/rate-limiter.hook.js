import rateLimit from '@fastify/rate-limit';
import { valkey } from '../../infrastructure/providers/cache-core.adapter.js';

/**
 * Registra y configura el limitador global de tasa de peticiones (Rate Limiting) en Fastify.
 * Configura un almacenamiento centralizado y persistente en Valkey para compatibilidad con clústeres.
 * Permite configuraciones por ruta a través de la propiedad `config.rateLimit`.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 */
export async function registerRateLimiter(app) {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: valkey,
    allowList: [],
    keyGenerator: (request) => request.ip,
    // Cabeceras estándar de rate-limit (RFC 6585).
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
  });
}
