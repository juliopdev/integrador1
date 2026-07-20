import cors from '@fastify/cors';

/**
 * Registra el plugin @fastify/cors en la instancia de Fastify.
 * Habilita CORS con `origin: true` y `credentials: true`. El filtrado dinámico de orígenes
 * (marca blanca por tenant) se delega al hook `cors-validator.hook`.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 */
export async function registerCors(app) {
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
}
