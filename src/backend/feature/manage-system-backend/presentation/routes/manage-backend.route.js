import { requireSuperadmin } from '../../../../common/auth.middleware.js';

/**
 * ES: Ruteador administrativo para el motor No-Code de planos técnicos (Blueprints).
 * Expone endpoints HTML para el dashboard/asistente y endpoints REST JSON para operaciones CRUD.
 * 
 * EN: Administrative router for the no-code technical blueprint engine.
 * Exposes HTML endpoints for the dashboard/wizard and REST JSON endpoints for CRUD operations.
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */
export default async function manageBackendRoute(fastify) {
  // ============================================================================
  // ES: VISTAS SSR (Dashboard & Asistente Wizard)
  // EN: SSR VIEWS (Dashboard & Wizard Assistant)
  // ============================================================================

  // ES: GET /dashboard/backends - Lista los backends existentes.
  // EN: GET /dashboard/backends - Lists existing backends.
  fastify.get('/dashboard/backends', { preHandler: requireSuperadmin }, async (req, reply) => {
    try {
      const getBackendsUseCase = req.scope.resolve('getBackendsUseCase');
      const backends = await getBackendsUseCase.execute();

      return reply.view('backend/feature/manage-system-backend/presentation/views/_index.ejs', {
        title: 'Gestor de Backends No-Code',
        backends,
        blueprint: null,
        activeStep: 'list',
        error: null,
        stylesheet: '/styles/dashboard-system.css',
      }, {
        layout: 'frontend/layouts/dashboard.ejs'
      });
    } catch (error) {
      req.log.error(error);
      return reply.view('backend/feature/manage-system-backend/presentation/views/_index.ejs', {
        title: 'Gestor de Backends No-Code',
        backends: [],
        blueprint: null,
        activeStep: 'list',
        error: error.message,
        stylesheet: '/styles/dashboard-system.css',
      }, {
        layout: 'frontend/layouts/dashboard.ejs'
      });
    }
  });

  // ES: GET /dashboard/backends/new - Abre el Asistente Wizard para crear un nuevo backend.
  // EN: GET /dashboard/backends/new - Opens the Wizard Assistant to build a new backend.
  fastify.get('/dashboard/backends/new', { preHandler: requireSuperadmin }, async (req, reply) => {
    return reply.view('backend/feature/manage-system-backend/presentation/views/_index.ejs', {
      title: 'Nuevo Backend No-Code',
      backends: [],
      blueprint: { id: '', name: '', version: 'v1', schema: { tables: [] } },
      activeStep: 'wizard',
      error: null,
      stylesheet: '/styles/dashboard-system.css',
    }, {
      layout: 'frontend/layouts/dashboard.ejs'
    });
  });

  // ES: GET /dashboard/backends/:id/edit - Carga un plano existente en el asistente para modificarlo.
  // EN: GET /dashboard/backends/:id/edit - Loads an existing blueprint in the assistant to modify it.
  fastify.get('/dashboard/backends/:id/edit', { preHandler: requireSuperadmin }, async (req, reply) => {
    const { id } = req.params;
    try {
      const getBackendDetailUseCase = req.scope.resolve('getBackendDetailUseCase');
      const blueprint = await getBackendDetailUseCase.execute(id);

      if (!blueprint) {
        return reply.status(404).view('backend/common/templates/_404.ejs', { title: 'Plano No Encontrado' });
      }

      return reply.view('backend/feature/manage-system-backend/presentation/views/_index.ejs', {
        title: `Editar Backend: ${blueprint.name}`,
        backends: [],
        blueprint,
        activeStep: 'wizard',
        error: null,
        stylesheet: '/styles/dashboard-system.css',
      }, {
        layout: 'frontend/layouts/dashboard.ejs'
      });
    } catch (error) {
      req.log.error(error);
      return reply.redirect('/dashboard/backends');
    }
  });

  // ============================================================================
  // ES: SERVICIOS API REST (JSON)
  // EN: REST API SERVICES (JSON)
  // ============================================================================

  // ES: POST /api-system/v1/backends - Crea un plano y genera auditoría.
  // EN: POST /api-system/v1/backends - Creates a blueprint and triggers auditing.
  fastify.post('/api-system/v1/backends', { preHandler: requireSuperadmin }, async (req, reply) => {
    const { id, name, version, schema } = req.body || {};
    try {
      const defineDbSchemaUseCase = req.scope.resolve('defineDbSchemaUseCase');
      const blueprint = await defineDbSchemaUseCase.execute({ id, name, version, schema });

      return reply.send({
        success: true,
        message: 'Blueprint defined successfully / Plano técnico creado con éxito',
        blueprint,
      });
    } catch (error) {
      req.log.error(error);
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: error.message,
      });
    }
  });

  // ES: PUT /api-system/v1/backends/:id - Actualiza plano y genera auditoría.
  // EN: PUT /api-system/v1/backends/:id - Updates blueprint and triggers auditing.
  fastify.put('/api-system/v1/backends/:id', { preHandler: requireSuperadmin }, async (req, reply) => {
    const { id } = req.params;
    const { name, version, schema } = req.body || {};
    try {
      const updateBackendUseCase = req.scope.resolve('updateBackendUseCase');
      const blueprint = await updateBackendUseCase.execute(id, { name, version, schema });

      return reply.send({
        success: true,
        message: 'Blueprint updated successfully / Plano técnico actualizado con éxito',
        blueprint,
      });
    } catch (error) {
      req.log.error(error);
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: error.message,
      });
    }
  });

  // ES: DELETE /api-system/v1/backends/:id - Borrado lógico de un plano.
  // EN: DELETE /api-system/v1/backends/:id - Logical deletion of a blueprint.
  fastify.delete('/api-system/v1/backends/:id', { preHandler: requireSuperadmin }, async (req, reply) => {
    const { id } = req.params;
    try {
      const deleteBackendUseCase = req.scope.resolve('deleteBackendUseCase');
      await deleteBackendUseCase.execute(id);

      return reply.send({
        success: true,
        message: 'Blueprint deleted successfully / Plano técnico eliminado lógicamente',
      });
    } catch (error) {
      req.log.error(error);
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message: error.message,
      });
    }
  });
}
