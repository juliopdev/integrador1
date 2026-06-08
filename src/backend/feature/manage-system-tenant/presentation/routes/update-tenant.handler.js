import { requireSuperadmin } from '../../../../common/auth.middleware.js';

/**
 * ES: Manejador de rutas para actualizar los inquilinos.
 * EN: Route handler for updating tenants.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function updateTenantHandler(fastify) {
  fastify.put('/api-system/v1/tenants/:id', { preHandler: requireSuperadmin }, async (req, reply) => {
    const { id } = req.params;
    const { status, plan } = req.body || {};
    try {
      const tenantRepository = req.scope.resolve('tenantRepository');
      const dataToUpdate = {};
      if (status) dataToUpdate.status = status;
      if (plan) dataToUpdate.plan = plan;

      const updated = await tenantRepository.update(id, dataToUpdate);
      return reply.send({ success: true, tenant: updated });
    } catch (error) {
      req.log.error(error);
      return reply.status(500).send({ success: false, error: 'Internal Server Error' });
    }
  });

  fastify.post('/api-system/v1/tenants/:id/toggle-status', { preHandler: requireSuperadmin }, async (req, reply) => {
    const { id } = req.params;
    try {
      const toggleTenantStatusUseCase = req.scope.resolve('toggleTenantStatusUseCase');
      const tenant = await toggleTenantStatusUseCase.execute(id);
      return reply.send({ success: true, tenant });
    } catch (error) {
      req.log.error(error);
      return reply.status(error.message.includes('not found') ? 404 : 500).send({ success: false, error: error.message });
    }
  });
}
