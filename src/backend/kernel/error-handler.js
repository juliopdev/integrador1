import { AppError } from '../common/errors.js';
import { errorBody } from '../common/responses.js';

/**
 * Renderiza de manera uniforme vistas HTML de error para solicitudes que acepten text/html.
 * Mapea la vista adecuada adaptándose a si el usuario está en el contexto de `/dashboard` o fuera de él.
 * 
 * @param {import('fastify').FastifyReply} reply - Respuesta HTTP de Fastify.
 * @param {import('fastify').FastifyRequest} request - Solicitud entrante de Fastify.
 * @param {number} statusCode - Código de estado HTTP.
 * @param {string} errorCode - Identificador del error de negocio (SNAKE_CASE).
 * @param {string} message - Descripción legible del error.
 * @param {string} actionAttempted - Descripción de la acción que se intentó realizar.
 * @returns {import('fastify').FastifyReply} Objeto reply de Fastify con la plantilla renderizada.
 */
export function renderErrorView(reply, request, statusCode, errorCode, message, actionAttempted) {
  const isDashboardRoute = request.url.startsWith('/dashboard');
  const layout = (isDashboardRoute && request.user) ? 'frontend/layouts/dashboard' : 'frontend/layouts/auth';
  return reply.code(statusCode).view(layout, {
    page: 'backend/common/templates/error/error',
    statusCode,
    title: errorCode,
    actionAttempted,
    message,
    recoveryUrl: isDashboardRoute ? '/dashboard' : '/',
    brandTitle: 'Mi Baas',
    activePath: isDashboardRoute ? '/dashboard' : '/',
    user: request.user || null,
    category: request.user ? request.user.category : null,
  });
}

/**
 * Registra y configura el manejador global de errores (`setErrorHandler`) y de recursos no encontrados (`setNotFoundHandler`)
 * en la instancia de Fastify. Intercepta excepciones de validación Zod, errores controlados de aplicación (`AppError`)
 * y fallos no previstos (500), garantizando que no se filtren detalles de seguridad al cliente final y retornando respuestas uniformes.
 * 
 * @param {import('fastify').FastifyInstance} app - Instancia del servidor Fastify.
 */
export function registerErrorHandler(app) {
  app.setErrorHandler((err, request, reply) => {
    const acceptsHtml = request.headers.accept && request.headers.accept.includes('text/html');

    if (err.validation) {
      request.log.warn({ err }, 'validation error');
      if (acceptsHtml) {
        return renderErrorView(
          reply,
          request,
          400,
          'VALIDATION_ERROR',
          'La solicitud no pasó la validación.',
          'Enviar formulario o solicitud'
        );
      }
      const details = {};
      for (const item of err.validation) {
        const field = item.instancePath
          ? item.instancePath.replace(/^\//, '').replace(/\//g, '.')
          : item.params.missingProperty;
        if (field) {
          if (!details[field]) details[field] = [];
          details[field].push(item.message);
        }
      }
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'La solicitud no pasó la validación.', details));
    }

    if (err instanceof AppError) {
      if (err.statusCode >= 500) request.log.error({ err }, err.code);
      else request.log.warn({ err }, err.code);

      if (acceptsHtml) {
        return renderErrorView(
          reply,
          request,
          err.statusCode,
          err.code,
          err.message,
          'Acción en ' + request.url
        );
      }
      // Los use cases pueden anexar `err.details` con contexto estructurado (dependencies,
      // affectedResources, etc.) para que la UI lo consuma. Se propaga sólo si viene explícito.
      return reply.code(err.statusCode).send(errorBody(err.statusCode, err.code, err.message, err.details));
    }

    const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err }, 'unhandled error');
      // Iter UX: exponer el mensaje/stack al hook `platform-log-recorder` para que aparezca
      // en el listado de logs del Superadmin. Sin esto, el operador ve "500" sin saber por qué.
      request._recordedError = { message: err.message, stack: err.stack };
      if (acceptsHtml) {
        return renderErrorView(
          reply,
          request,
          500,
          'INTERNAL_ERROR',
          'Ocurrió un error interno.',
          'Acceder a ' + request.url
        );
      }
      return reply.code(500).send(errorBody(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'));
    }

    request.log.warn({ err }, 'client error');
    if (acceptsHtml) {
      return renderErrorView(
        reply,
        request,
        status,
        err.code || 'BAD_REQUEST',
        'Solicitud inválida.',
        'Acceder a ' + request.url
      );
    }
    return reply.code(status).send(errorBody(status, err.code || 'BAD_REQUEST', 'Solicitud inválida.'));
  });

  app.setNotFoundHandler(async (request, reply) => {
    const SYSTEM_PREFIXES = ['/api/', '/api-system/', '/ws/', '/auth/', '/dashboard', '/health', '/scripts/', '/styles/'];
    const urlPath = request.url.split('?')[0];

    // Modo externo: el subdominio del tenant redirige a su propio hosting/dominio. Fallback a nivel
    // de app (dev no tiene Caddy delante; en prod da resiliencia si Caddy aún no re-sembró la regla).
    // Excluye las rutas de sistema — el sitio externo sigue consumiendo la API en `<sub>.<apex>/api/*`
    // y el Master conserva su `/dashboard`. 302 (temporal) para no cachear si luego cambia el modo.
    if (
      request.tenant &&
      request.tenant.frontendMode === 'external' &&
      request.tenant.externalUrl &&
      !SYSTEM_PREFIXES.some((p) => urlPath.startsWith(p))
    ) {
      return reply.redirect(request.tenant.externalUrl);
    }

    if (
      request.tenant &&
      request.tenant.frontendMode === 'hosted' &&
      request.tenant.extractedPath &&
      !SYSTEM_PREFIXES.some((p) => urlPath.startsWith(p))
    ) {
      const baseDir = request.tenant.extractedPath;
      const relative = urlPath === '/' ? 'index.html' : urlPath.slice(1);
      const { join, resolve } = await import('node:path');
      const { existsSync } = await import('node:fs');
      const filePath = resolve(join(baseDir, relative));

      // Anti path-traversal: el path resuelto DEBE quedar dentro de baseDir.
      const isSafe = filePath.startsWith(resolve(baseDir));
      if (isSafe && existsSync(filePath)) {
        return reply.sendFile(relative, baseDir);
      }
      if (isSafe && existsSync(join(baseDir, 'index.html'))) {
        return reply.sendFile('index.html', baseDir);
      }
    }

    const acceptsHtml = request.headers.accept && request.headers.accept.includes('text/html');
    if (acceptsHtml) {
      return renderErrorView(
        reply,
        request,
        404,
        'NOT_FOUND',
        'La ruta solicitada no existe o no se encuentra disponible.',
        'Acceder a la ruta ' + request.url
      );
    }
    return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'La ruta solicitada no existe.'));
  });
}
