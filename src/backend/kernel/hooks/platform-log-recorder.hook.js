import { record } from '../../feature/manage-platform-log/infrastructure/platform-log-recorder.js';

// Rutas de instrumentación excluidas: el propio stream (`/api-system/v1/logs/stream`) generaría
// una cascada infinita si registrara sus propias respuestas. `/health` se excluye porque su
// polling típico (probes) ensuciaría el listado con ruido.
const EXCLUDED_PATHS = new Set(['/health', '/api-system/v1/logs/stream']);

// Los estáticos entran como prefijo (los assets de Vite son `/scripts/*.js`, `/styles/*.css`).
const EXCLUDED_PREFIXES = ['/scripts/', '/styles/', '/favicon', '/assets/'];

/**
 * Comprueba si una URL de solicitud está excluida de los registros de logs del operador.
 * 
 * @param {string} url - URL de la petición.
 * @returns {boolean} `true` si la URL está excluida, de lo contrario `false`.
 */
function isExcluded(url) {
  const path = url.split('?')[0];
  if (EXCLUDED_PATHS.has(path)) return true;
  return EXCLUDED_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * Determina el nivel de severidad del log en función del código de estado HTTP.
 * 
 * @param {number} statusCode - Código de respuesta HTTP.
 * @returns {'error'|'warn'|'info'} Nivel de log.
 */
function levelFor(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/**
 * Registra el hook global `onResponse` en Fastify para la persistencia e impulsión de logs.
 * Mapea las peticiones y respuestas a registros en base de datos (`platform_logs_local`) y notificaciones SSE del Superadmin.
 * Excluye explícitamente rutas de telemetría (/health) y el propio endpoint del stream de logs para evitar llamadas recursivas.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia del servidor Fastify.
 */
export function registerPlatformLogRecorder(app) {
  app.addHook('onResponse', (request, reply, done) => {
    if (isExcluded(request.url)) return done();

    const level = levelFor(reply.statusCode);
    const message = `${request.method} ${request.url} → ${reply.statusCode}`;
    // Metadata mínima; NO incluir body/query/headers acá (evita filtrar secretos y payloads
    // grandes al listado del dashboard). Si en el futuro se quiere más detalle, sanitizar como
    // hace `dev-logger.hook`.
    const metadata = {
      method: request.method,
      status: reply.statusCode,
      ip: request.ip,
    };

    // Iter UX: el error-handler puede haber anotado `_recordedError` con el mensaje/stack del
    // Error que causó el 5xx (o 4xx AppError). Lo incluimos en metadata para que el operador
    // vea la causa en el listado de logs sin depender del stdout del proceso.
    if (request._recordedError) {
      metadata.errorMessage = request._recordedError.message;
      metadata.errorStack = request._recordedError.stack;
    }

    record({ level, message, metadata });
    done();
  });
}
