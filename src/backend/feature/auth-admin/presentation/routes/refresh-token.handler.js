/**
 * ES: Manejador de rutas para refrescar los tokens de acceso administrativo.
 * Lee el refresh token de las cookies y emite un nuevo access token.
 * 
 * EN: Route handler to refresh administrative access tokens.
 * Reads the refresh token from cookies and issues a new access token.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function refreshTokenHandler(fastify) {
  fastify.post('/api-system/v1/refresh-token', async (req, reply) => {
    const cookieService = req.scope.resolve('cookieService');
    
    // ES: Parsear cookies de la cabecera 'Cookie' de la request.
    // EN: Parse cookies from request 'Cookie' header.
    const cookies = cookieService.parse(req.headers.cookie);
    const refreshToken = cookies.refresh_token;

    try {
      const refreshTokenUseCase = req.scope.resolve('refreshTokenAdminUseCase');
      const result = await refreshTokenUseCase.execute(refreshToken);

      // ES: Serializar el nuevo token de acceso en la cookie.
      // EN: Serialize the new access token in the cookie.
      const accessCookie = cookieService.serialize('access_token', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 900,
        sameSite: 'lax',
      });

      reply.header('Set-Cookie', accessCookie);

      return reply.send({
        success: true,
        accessToken: result.accessToken,
      });
    } catch (error) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: error.message || 'Invalid refresh token / Token de refresco inválido',
      });
    }
  });
}
