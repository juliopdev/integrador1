/**
 * Rutas SSR de auth-admin (`/dashboard/*`) — renderizan vistas EJS (contrato de respuesta distinto al
 * de `api.handler.js`, que devuelve JSON). El layout `auth` envuelve la página vía el local `page`.
 * (Redirección de sesión activa de flows.md; pendiente, con session-auth en SSR.)
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerAuthAdminViews(app) {
  app.get('/dashboard/login', async (request, reply) => {
    if (!request.query?.tk && request.user) {
      return reply.redirect('/dashboard');
    }
    return reply.view('frontend/layouts/auth', {
      page: 'backend/feature/auth-admin/presentation/views/pages/_admin-login',
      pageTitle: request.query?.tk ? 'Activar cuenta · Mi Baas' : 'Iniciar sesión · Mi Baas',
      error: request.query?.error ?? null,
      token: request.query?.tk ?? null,
      activated: request.query?.activated === '1',
      // Banners informativos del flujo de recuperación (anti-enumeración: la señal es la llegada
      // del correo, no el server). `?forgot=1` → mostramos "revisá tu correo"; `?reset=1` →
      // "contraseña actualizada". Renderizados dentro de `_form-login-body` como alerts success.
      forgotSent: request.query?.forgot === '1',
      reset: request.query?.reset === '1',
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
    });
  });

  app.get('/dashboard/forgot-pass', async (request, reply) => {
    if (request.user) {
      return reply.redirect('/dashboard');
    }
    return reply.view('frontend/layouts/auth', {
      page: 'backend/feature/auth-admin/presentation/views/pages/_admin-forgot-pass',
      pageTitle: 'Recuperar acceso · Mi Baas',
      error: request.query?.error ?? null,
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
    });
  });

  app.get('/dashboard/reset-pass', async (request, reply) => {
    if (request.user) {
      return reply.redirect('/dashboard');
    }
    return reply.view('frontend/layouts/auth', {
      page: 'backend/feature/auth-admin/presentation/views/pages/_admin-reset-pass',
      pageTitle: 'Nueva contraseña · Mi Baas',
      token: request.query?.tk ?? null,
      error: request.query?.error ?? null,
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
    });
  });
}
