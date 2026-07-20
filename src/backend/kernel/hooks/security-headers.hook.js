import { env } from '../../config/env.js';

/**
 * Registra el hook `onRequest` para inyectar cabeceras de seguridad HTTP estándar (equivalente Helmet).
 * Configura políticas de Content-Security-Policy (CSP) restrictivas (adaptadas en desarrollo para Swagger),
 * HSTS en producción y mitigación de clickjacking.
 * 
 * @param {import('fastify').FastifyInstance} app - Instancia del servidor Fastify.
 */
export function registerSecurityHeaders(app) {
  const isProd = env.NODE_ENV === 'production';

  // CSP varía por entorno: desarrollo necesita unsafe-inline para Swagger UI.
  const csp = isProd
    ? [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https:",
        "font-src 'self' https: https://fonts.gstatic.com",
        "connect-src 'self' http://localhost:3000 http://*.localhost:3000 ws://localhost:3000 ws://*.localhost:3000",
        "frame-ancestors 'self'",
      ].join('; ');

  app.addHook('onRequest', (_request, reply, done) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    // X-XSS-Protection se deshabilita intencionalmente: el filtro XSS de navegadores
    // antiguos puede introducir más problemas de los que resuelve. CSP lo reemplaza.
    reply.header('X-XSS-Protection', '0');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', csp);

    if (isProd) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    done();
  });
}
