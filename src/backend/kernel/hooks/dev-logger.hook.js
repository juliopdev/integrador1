import { env } from '../../config/env.js';

/**
 * Hooks `onRequest` + `onResponse` de logging enriquecido para desarrollo.
 *
 * Cada log responde a las 6 preguntas obligatorias de .doc/rules/logs.md:
 * 1. ¿Qué data solicita el front? → Payload sanitizado (sin passwords/hashes)
 * 2. ¿A qué ruta? → request.url
 * 3. ¿Qué método? → request.method
 * 4. ¿Qué usuario? → email ofuscado (no rol) o 'Anonymous'
 * 5. ¿Qué código se responde? → reply.statusCode
 * 6. ¿Cuánto tarda? → latencia en ms (hrtime)
 *
 * Solo activo en `NODE_ENV === 'development'`. En producción no se registra.
 * Ver .doc/rules/logs.md y .doc/rules/hooks.md (dev-logger.hook.js).
 */

// Claves sensibles que se redactan del payload antes de imprimir.
const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'passwordhash',
  'passphrase', 'passphrase_hash', 'passphrasehash',
  'token', 'token_hash', 'tokenhash',
  'secret', 'apikey', 'api_key',
  'authorization', 'cookie',
]);

/** Sanitiza un objeto eliminando campos sensibles. */
/**
 * Sanitiza recursivamente (primer nivel) un objeto de datos (ej. body request)
 * reemplazando los valores de claves sensibles (passwords, tokens, cookies) por marcas '[REDACTED]'.
 * 
 * @param {Object} obj - Objeto a sanitizar.
 * @returns {Object} Objeto resultante sanitizado y seguro para impresión en consola.
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalized = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(normalized)) {
      clean[key] = '[REDACTED]';
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Ofusca un correo electrónico del actor de la solicitud mostrando solo sus primeros caracteres.
 * Sirve para el anonimato de logs y auditoría preventiva.
 * 
 * @param {string|null|undefined} email - Email a ofuscar.
 * @returns {string} Email ofuscado (ej. 'ad***@domain.com') o 'Anonymous' si no existe.
 */
function obfuscateEmail(email) {
  if (!email) return 'Anonymous';
  const at = email.indexOf('@');
  if (at < 1) return 'Anonymous';
  const visible = email.slice(0, Math.min(2, at));
  return `${visible}***${email.slice(at)}`;
}

/**
 * Registra los hooks `onRequest` (para captura de tiempo de inicio) y `onResponse` (para logging resumido estructurado).
 * Este logger enriquecido de consola sólo se activa en entorno 'development'.
 * 
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 */
export function registerDevLogger(app) {
  if (env.NODE_ENV !== 'development') return;

  // onRequest: registra timestamp de inicio para calcular latencia.
  app.addHook('onRequest', (request, _reply, done) => {
    request._devLogStart = process.hrtime.bigint();
    done();
  });

  // onResponse: imprime el resumen estructurado.
  app.addHook('onResponse', (request, reply, done) => {
    const elapsedNs = process.hrtime.bigint() - (request._devLogStart ?? process.hrtime.bigint());
    const elapsedMs = (Number(elapsedNs) / 1e6).toFixed(2);

    const user = request.user?.email ? obfuscateEmail(request.user.email) : 'Anonymous';
    const payload = request.body ? sanitize(request.body) : undefined;
    const query = request.query && Object.keys(request.query).length > 0 ? request.query : undefined;

    const parts = [
      `${request.method} | ${request.url}`,
      `  User: ${user}`,
    ];
    if (payload) parts.push(`  Payload: ${JSON.stringify(payload)}`);
    if (query) parts.push(`  Query: ${JSON.stringify(query)}`);
    parts.push(`  Response: ${reply.statusCode} | Latency: ${elapsedMs}ms`);

    request.log.info(parts.join('\n'));
    done();
  });
}
