import { requireSuperadmin } from '../../../../common/auth.middleware.js';

/**
 * ES: Manejador de rutas para obtener listas y detalles de inquilinos.
 * EN: Route handler for retrieving lists and details of tenants.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function getTenantsHandler(fastify) {
  fastify.get('/dashboard/tenants', { preHandler: requireSuperadmin }, async (req, reply) => {
    try {
      const getTenantsUseCase = req.scope.resolve('getTenantsUseCase');
      const tenants = await getTenantsUseCase.execute();

      return reply.view('backend/feature/manage-system-tenant/presentation/views/_index.ejs', {
        title: 'Gestión de Inquilinos',
        stylesheet: '/styles/dashboard-system.css',
        page: 'pages/_system-list-tenants.ejs',
        user: req.adminUser,
        tenants,
      }, {
        layout: 'frontend/layouts/dashboard.ejs'
      });
    } catch (error) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/dashboard/tenants/new', { preHandler: requireSuperadmin }, async (req, reply) => {
    try {
      const getBackendsUseCase = req.scope.resolve('getBackendsUseCase');
      const blueprints = await getBackendsUseCase.execute();

      return reply.view('backend/feature/manage-system-tenant/presentation/views/_index.ejs', {
        title: 'Crear Inquilino',
        stylesheet: '/styles/dashboard-system.css',
        page: 'pages/_system-create-tenant.ejs',
        user: req.adminUser,
        blueprints,
      }, {
        layout: 'frontend/layouts/dashboard.ejs'
      });
    } catch (error) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/dashboard/tenants/:id/edit', { preHandler: requireSuperadmin }, async (req, reply) => {
    try {
      const { id } = req.params;
      const getTenantDetailUseCase = req.scope.resolve('getTenantDetailUseCase');
      const tenant = await getTenantDetailUseCase.execute(id);

      return reply.view('backend/feature/manage-system-tenant/presentation/views/_index.ejs', {
        title: 'Editar Inquilino',
        stylesheet: '/styles/dashboard-system.css',
        page: 'pages/_system-update-tenant.ejs',
        user: req.adminUser,
        tenant,
      }, {
        layout: 'frontend/layouts/dashboard.ejs'
      });
    } catch (error) {
      req.log.error(error);
      return reply.status(error.message.includes('not found') ? 404 : 500).send({ error: error.message });
    }
  });

  fastify.get('/api-system/v1/tenants', { preHandler: requireSuperadmin }, async (req, reply) => {
    try {
      const getTenantsUseCase = req.scope.resolve('getTenantsUseCase');
      const tenants = await getTenantsUseCase.execute();

      return reply.send({ success: true, tenants });
    } catch (error) {
      req.log.error(error);
      return reply.status(500).send({ success: false, error: 'Internal Server Error' });
    }
  });
}