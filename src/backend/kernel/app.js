import Fastify from 'fastify';
import awilixPlugin from './plugins/awilix.js';
import viewsPlugin from './plugins/views.js';
import staticPlugin from './plugins/static.js';
import tenantLoader from './plugins/tenant-loader.js';

// ES: Importaciones de los manejadores de rutas de autenticación.
// EN: Imports for authentication route handlers.
import loginAdminHandler from '../feature/auth-admin/presentation/routes/login.handler.js';
import logoutAdminHandler from '../feature/auth-admin/presentation/routes/logout.handler.js';
import refreshTokenAdminHandler from '../feature/auth-admin/presentation/routes/refresh-token.handler.js';
import loginUserHandler from '../feature/auth-user/presentation/routes/login.handler.js';
import registerUserHandler from '../feature/auth-user/presentation/routes/register.handler.js';
import createTenantHandler from '../feature/manage-system-tenant/presentation/routes/create-tenant.handler.js';
import getTenantsHandler from '../feature/manage-system-tenant/presentation/routes/get-tenants.handler.js';
import updateTenantHandler from '../feature/manage-system-tenant/presentation/routes/update-tenant.handler.js';
import manageBackendRoute from '../feature/manage-system-backend/presentation/routes/manage-backend.route.js';
import adminDashboardHomeHandler from '../feature/manage-admin-dashboard/presentation/routes/home.handler.js';

const app = Fastify({
  logger: true,
});

// ES: Registrar parseador para datos de formulario urlencoded (solucionando el error 415).
// EN: Register parser for urlencoded form data (resolving the 415 error).
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
  try {
    const params = new URLSearchParams(body);
    const parsed = {};
    for (const [key, value] of params.entries()) {
      parsed[key] = value;
    }
    done(null, parsed);
  } catch (err) {
    done(err);
  }
});

// ES: Registro de Plugins de infraestructura (IoC, EJS y Middleware de carga de Inquilinos).
// EN: Infrastructure plugins registration (IoC, EJS, and Tenant loading middleware).
await app.register(awilixPlugin);
await app.register(viewsPlugin);
await app.register(staticPlugin);
await app.register(tenantLoader); // ES: Debe ejecutarse antes que los ruteadores. EN: Must execute before routing handlers.

// ES: Registro de las rutas de la Matriz de Autenticación.
// EN: Authentication Matrix routes registration.
await app.register(loginAdminHandler);
await app.register(logoutAdminHandler);
await app.register(refreshTokenAdminHandler);
await app.register(loginUserHandler);
await app.register(registerUserHandler);

// ES: Registro de las rutas de administración de inquilinos y planos de backends.
// EN: Registration of tenant administration and backend blueprints routes.
await app.register(createTenantHandler);
await app.register(getTenantsHandler);
await app.register(updateTenantHandler);
await app.register(manageBackendRoute);
await app.register(adminDashboardHomeHandler);

/**
 * ES: Manejador Global para Peticiones no Encontradas (Errores 404).
 * Si el cliente solicita explícitamente HTML, renderiza el template '_404.ejs'.
 * Si es una petición de API o solicita JSON, responde con una estructura estructurada de error.
 * 
 * EN: Global Handler for Unresolved Requests (404 Errors).
 * If the client explicitly requests HTML, it renders the '_404.ejs' template.
 * If it is an API request or expects JSON, it responds with a structured JSON error.
 */
app.setNotFoundHandler(async (request, reply) => {
  const acceptsHtml = request.headers.accept && request.headers.accept.includes('text/html');
  const isApi = request.url.startsWith('/api/') || request.url.startsWith('/api-system/');

  if (isApi || !acceptsHtml) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
    });
  }

  return reply.status(404).view('backend/common/templates/_404.ejs', { title: '404 - Página No Encontrada' });
});

/**
 * ES: Manejador Global de Excepciones del Servidor (Errores 500 / 401).
 * Detecta si el error corresponde a una solicitud de API para responder en formato JSON.
 * Si es una solicitud de navegador (HTML), renderiza vistas específicas (`_401.ejs`, `_500.ejs`)
 * inyectando detalles del error únicamente bajo entornos locales de depuración.
 * 
 * EN: Global Server Exceptions Handler (500 / 401 Errors).
 * Detects whether the error originates from an API request to respond in JSON.
 * If it is a web browser request (HTML), it renders specific pages (`_401.ejs`, `_500.ejs`)
 * injecting error stacktraces only inside local debugging environments.
 */
app.setErrorHandler(async (error, request, reply) => {
  request.log.error(error);

  const acceptsHtml = request.headers.accept && request.headers.accept.includes('text/html');
  const isApi = request.url.startsWith('/api/') || request.url.startsWith('/api-system/');
  const statusCode = error.statusCode || 500;

  if (isApi || !acceptsHtml) {
    return reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Internal Server Error',
      message: error.message,
    });
  }

  if (statusCode === 401 || statusCode === 403) {
    return reply.status(statusCode).view('backend/common/templates/_401.ejs', { 
      title: 'No Autorizado', 
      message: error.message || 'No tienes permisos para acceder a esta página.' 
    });
  }

  return reply.status(500).view('backend/common/templates/_500.ejs', { 
    title: '500 - Error Interno', 
    error: error.message || 'Ha ocurrido un error inesperado en el servidor.' 
  });
});

// ============================================================================
// ES: Rutas de Diagnóstico y Salud para la Validación.
// EN: Health and Diagnostic Routes for Validation.
// ============================================================================

app.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

app.get('/test-500', async (request, reply) => {
  throw new Error('Simulación de error de servidor.');
});

export default app;
