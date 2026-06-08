/**
 * ES: Manejador de rutas para el registro de usuarios finales del inquilino (Headless API).
 * Retorna las credenciales de token directo en la respuesta JSON.
 * 
 * EN: Route handler for tenant end-user registration (Headless API).
 * Returns token credentials directly in the JSON response.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function userRegisterHandler(fastify) {
  fastify.post('/api/v1/register', async (req, reply) => {
    const { email, password } = req.body || {};

    try {
      // ES: Resolver caso de uso de registro desde el scope del inquilino.
      // EN: Resolve registration use case from the tenant scoped container.
      const registerUserUseCase = req.scope.resolve('registerUserUseCase');
      const result = await registerUserUseCase.execute({ email, password });

      return reply.send({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (error) {
      const status = error.statusCode || 400;
      return reply.status(status).send({
        success: false,
        error: status === 503 ? 'Service Unavailable' : 'Bad Request',
        message: error.message,
      });
    }
  });
}
