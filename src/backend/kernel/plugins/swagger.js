import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../../config/env.js';

/**
 * Registra el plugin @fastify/swagger con especificación OpenAPI 3.1 para documentación
 * autogenerada de la API de plataforma. En entorno de desarrollo monta Swagger UI en `/docs`.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 */
export async function registerSwagger(app) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'BaaS Platform API',
        description: 'Multi-Tenant Backend-as-a-Service — documentación autogenerada.',
        version: '1.0.0',
      },
      servers: [{ url: env.APP_URL }],
    },
  });

  if (env.NODE_ENV === 'development') {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }
}
