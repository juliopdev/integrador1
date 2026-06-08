/**
 * ES: Manejador de rutas para la página de inicio del panel administrativo (/dashboard).
 * Determina el contexto del administrador (Superadmin vs Tenant Master/Staff)
 * y sirve la vista del portal unificado de forma segura.
 * 
 * EN: Route handler for the administrative dashboard home page (/dashboard).
 * Determines administrator context (Superadmin vs Tenant Master/Staff)
 * and serves the unified portal view securely.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function adminDashboardHomeHandler(fastify) {
  fastify.get('/dashboard', async (req, reply) => {
    const cookieService = req.scope.resolve('cookieService');
    const tokenService = req.scope.resolve('tokenService');
    const env = req.scope.resolve('env');

    // ES: Parsear cookies y extraer token de acceso.
    // EN: Parse cookies and extract access token.
    const cookies = cookieService.parse(req.headers.cookie);
    const token = cookies.access_token;

    if (!token) {
      return reply.redirect('/dashboard/login');
    }

    try {
      // ES: Verificar autenticidad del token de sesión.
      // EN: Verify session token authenticity.
      const decoded = tokenService.verifyToken(token);

      // ES: Superadmin global.
      // EN: Global Superadmin.
      if (decoded.role === 'superadmin') {
        // ES: Si está en un subdominio, redirigir al dominio principal.
        // EN: If on a subdomain, redirect to the main domain.
        if (req.tenantContext) {
          // ES: Redirige al dashboard global usando redirección relativa.
          // EN: Redirect to global dashboard using relative redirect.
          return reply.redirect('/dashboard');
        }

        return reply.view('backend/feature/manage-admin-dashboard/presentation/views/_index.ejs', {
          title: 'Panel de Control - Superadmin',
          adminUser: decoded,
          tenant: null,
          error: null,
          stylesheet: '/styles/dashboard-system.css',
        }, {
          layout: 'frontend/layouts/dashboard.ejs'
        });
      }

      // ES: Master/Staff del Inquilino.
      // EN: Tenant Master/Staff.
      if (decoded.role === 'master' || decoded.role === 'staff') {
        // ES: Validar que esté accediendo a través del subdominio de su propio inquilino.
        // EN: Validate that access is made through their own tenant's subdomain.
        if (!req.tenantContext || req.tenantContext.id !== decoded.tenantId) {
          reply.status(403);
          return reply.view('backend/common/templates/_401.ejs', {
            title: 'Acceso Denegado',
            message: 'No estás autorizado para acceder a este inquilino / You are not authorized to access this tenant.',
          });
        }

        return reply.view('backend/feature/manage-admin-dashboard/presentation/views/_index.ejs', {
          title: `Panel de Control - ${req.tenantContext.name}`,
          adminUser: decoded,
          tenant: req.tenantContext,
          error: null,
          stylesheet: '/styles/dashboard-tenant.css',
        }, {
          layout: 'frontend/layouts/dashboard.ejs'
        });
      }

      // ES: Rol no reconocido para administración.
      // EN: Unrecognized administrative role.
      throw new Error('Unauthorized administrative role / Rol administrativo no autorizado');
    } catch (error) {
      req.log.warn('Dashboard access rejected / Acceso a dashboard rechazado:', error.message);

      // ES: Forzar borrado de cookie inválida o expirada y redirigir.
      // EN: Force delete invalid or expired cookie and redirect.
      const clearCookie = cookieService.serialize('access_token', '', {
        path: '/',
        maxAge: 0,
      });
      reply.header('Set-Cookie', clearCookie);
      return reply.redirect('/dashboard/login');
    }
  });
}