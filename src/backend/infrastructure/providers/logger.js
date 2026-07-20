import pino from 'pino';

/**
 * Logger pino compartido para código de infraestructura que ejecuta fuera del ciclo de vida
 * HTTP de Fastify (adapters, workers, suscripciones pub/sub, etc.).
 *
 * Fastify ya expone `app.log` / `request.log` para handlers y hooks — este módulo cubre
 * los casos donde no hay instancia Fastify disponible.
 *
 * En producción emite JSON estructurado; en development usa pino-pretty para legibilidad.
 * En test el nivel se sube a 'silent' para no ensuciar la salida de pruebas.
 */
const env = globalThis.process?.env?.NODE_ENV ?? 'production';

export const logger = pino({
  level: env === 'test' ? 'silent' : env === 'development' ? 'debug' : 'info',
  ...(env === 'development'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
    : {}),
});
