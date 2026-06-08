import { requireSuperadmin } from '../../../../common/auth.middleware.js';

/**
 * ES: Manejador de rutas para la creación e inicio de inquilinos (Tenants).
 * Expone el endpoint POST '/api-system/v1/tenants' protegido para Superadmins.
 * 
 * EN: Route handler for tenant creation and provisioning.
 * Exposes the protected POST '/api-system/v1/tenants' endpoint for Superadmins.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function createTenantHandler(fastify) {
  // ES: POST /api-system/v1/tenants - Registra y aprovisiona un inquilino con su cuenta Master.
  // EN: POST /api-system/v1/tenants - Registers and provisions a tenant along with its Master account.
  fastify.post('/api-system/v1/tenants', { preHandler: requireSuperadmin }, async (req, reply) => {
    const { id, name, subdomain, plan, backendBlueprintId, masterEmail, masterPassword, masterPassphrase } = req.body || {};

    try {
      // ES: Resolver caso de uso de registro de inquilino desde el contenedor global.
      // EN: Resolve the tenant registration use case from the global container.
      const registerTenantMasterUseCase = req.scope.resolve('registerTenantMasterUseCase');
      const tenant = await registerTenantMasterUseCase.execute({
        id,
        name,
        subdomain,
        plan,
        backendBlueprintId,
        masterEmail,
        masterPassword,
        masterPassphrase,
      });

      return reply.send({
        success: true,
        message: 'Tenant provisioned successfully / Inquilino aprovisionado con éxito',
        tenant,
      });
    } catch (error) {
      req.log.error(error);
      return reply.status(error.statusCode || 400).send({
        success: false,
        error: 'Bad Request',
        message: error.message,
      });
    }
  });
}
