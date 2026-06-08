/**
 * ES: Manejador de rutas para el inicio de sesión administrativo.
 * Soporta solicitudes GET (renderización de formulario SSR) y POST (procesamiento de credenciales).
 * 
 * EN: Route handler for administrative login.
 * Supports GET requests (SSR form rendering) and POST requests (credentials processing).
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function loginHandler(fastify) {
  // ES: GET /dashboard/login/ - Renderiza la pantalla de inicio de sesión administrativo.
  // EN: GET /dashboard/login/ - Renders the administrative login screen.
  fastify.get('/dashboard/login', async (req, reply) => {
    const tenant = req.tenantContext;
    return reply.view('backend/feature/auth-admin/presentation/views/_index.ejs', {
      title: 'Acceso Administrativo',
      error: null,
      tenant, // ES: Indica si es login de inquilino (Master) o global (Superadmin).
      stylesheet: tenant ? '/styles/auth-tenant.css' : '/styles/auth-system.css',
    }, {
      layout: 'frontend/layouts/auth.ejs'
    });
  });

  // ES: POST /dashboard/login/ - Procesa las credenciales y establece las cookies HTTP-only.
  // EN: POST /dashboard/login/ - Processes credentials and sets HTTP-only session cookies.
  fastify.post('/dashboard/login', async (req, reply) => {
    const { email, password, passphrase } = req.body || {};
    const tenantId = req.tenantContext ? req.tenantContext.id : null;
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');

    try {
      // ES: Resolver caso de uso desde el scope de la request de Awilix.
      // EN: Resolve the use case from the Awilix request scope.
      const loginUseCase = req.scope.resolve('loginAdminUseCase');
      const result = await loginUseCase.execute({ email, password, passphrase, tenantId });

      // ES: Resolver e instanciar cookies seguras de sesión.
      // EN: Resolve and set secure session cookies.
      const cookieService = req.scope.resolve('cookieService');
      const accessCookie = cookieService.serialize('access_token', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 900, // ES: 15 minutos. EN: 15 minutes.
        sameSite: 'lax',
      });
      const refreshCookie = cookieService.serialize('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 604800, // ES: 7 días. EN: 7 days.
        sameSite: 'lax',
      });

      // ES: Asignar cabecera de respuesta con las cookies serializadas.
      // EN: Attach response header with serialized cookies.
      reply.header('Set-Cookie', [accessCookie, refreshCookie]);

      // ES: Responder según la cabecera Accept.
      // EN: Respond depending on the Accept header.
      if (!acceptsHtml) {
        return reply.send({
          success: true,
          admin: result.admin,
        });
      }

      // ES: Redirige al Dashboard de administración correspondiente.
      // EN: Redirects to the respective administrative Dashboard.
      return reply.redirect('/dashboard');
    } catch (error) {
      if (!acceptsHtml) {
        return reply.status(401).send({
          success: false,
          error: 'Unauthorized',
          message: error.message,
        });
      }

      // ES: Re-renderiza el formulario mostrando el mensaje de error.
      // EN: Re-renders form showing the error message.
      const tenant = req.tenantContext;
      return reply.view('backend/feature/auth-admin/presentation/views/_index.ejs', {
        title: 'Acceso Administrativo',
        error: error.message,
        tenant,
        stylesheet: tenant ? '/styles/auth-tenant.css' : '/styles/auth-system.css',
      }, {
        layout: 'frontend/layouts/auth.ejs'
      });
    }
  });
}
