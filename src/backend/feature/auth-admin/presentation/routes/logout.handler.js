/**
 * ES: Manejador de rutas para el cierre de sesión administrativo.
 * Limpia las cookies seguras e invalida la sesión local.
 * 
 * EN: Route handler for administrative logout.
 * Clears secure cookies and invalidates local session.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function logoutHandler(fastify) {
  fastify.get('/dashboard/logout', async (req, reply) => {
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
    const cookieService = req.scope.resolve('cookieService');

    // ES: Generar cookies de expiración inmediata (maxAge: 0) para forzar el borrado en el navegador.
    // EN: Generate immediate expiration cookies (maxAge: 0) to force deletion in the browser.
    const accessCookie = cookieService.serialize('access_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    const refreshCookie = cookieService.serialize('refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });

    reply.header('Set-Cookie', [accessCookie, refreshCookie]);

    if (!acceptsHtml) {
      return reply.send({ success: true, message: 'Logged out successfully / Sesión cerrada' });
    }

    // ES: Redirección final a la pantalla de acceso administrativo.
    // EN: Final redirection to the administrative login screen.
    return reply.redirect('/dashboard/login');
  });

  // ES: POST handler también habilitado por conveniencia de APIs REST.
  // EN: POST handler enabled for REST API convenience.
  fastify.post('/dashboard/logout', async (req, reply) => {
    const cookieService = req.scope.resolve('cookieService');
    const accessCookie = cookieService.serialize('access_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    const refreshCookie = cookieService.serialize('refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });

    reply.header('Set-Cookie', [accessCookie, refreshCookie]);
    return reply.send({ success: true, message: 'Logged out successfully / Sesión cerrada' });
  });
}
