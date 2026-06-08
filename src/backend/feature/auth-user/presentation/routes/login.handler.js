/**
 * ES: Manejador de rutas para el inicio de sesión de usuarios finales del inquilino (Headless API).
 * Retorna las credenciales de token directo en la respuesta JSON.
 * 
 * EN: Route handler for tenant end-user login (Headless API).
 * Returns token credentials directly in the JSON response.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function userLoginHandler(fastify) {
  fastify.post('/api/v1/login', async (req, reply) => {
    const { email, password } = req.body || {};

    try {
      // ES: Resolver caso de uso desde el scope inyectado para el inquilino.
      // EN: Resolve the use case from the scoped container injected for the tenant.
      const loginUserUseCase = req.scope.resolve('loginUserUseCase');
      const result = await loginUserUseCase.execute({ email, password });

      return reply.send({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (error) {
      const status = error.statusCode || 401;
      return reply.status(status).send({
        success: false,
        error: status === 503 ? 'Service Unavailable' : 'Unauthorized',
        message: error.message,
      });
    }
  });
}
