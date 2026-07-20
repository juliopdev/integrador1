import { idParam } from '../../../../common/validators.js';
import { apiKeyGeneratedSchema, apiKeyStatusSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';

const tenantIdParamSchema = idParam('tenantId');

/**
 * Rutas de la API key "frontend" del tenant (**solo Superadmin**). Emitida por el Superadmin desde
 * el listado de backends para que el frontend del tenant se autentique contra `/api/v1/*`. El
 * valor crudo (`mbk_…`) viaja SOLO en la respuesta del POST; en tenant.db queda el hash.
 *
 * Este feature (P8 split) se separó de `manage-platform-backend` porque su ciclo de vida es
 * ortogonal al contrato No-Code — se genera/regenera sin tocar el contrato ni el draft.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia Fastify.
 * @param {Object} deps - Dependencias del handler.
 * @param {Function} deps.getTenantById - Obtiene un tenant por su ID.
 * @param {(tenantId: string) => { generate: Function, status: Function }} deps.makeApiKeyOpsFor - Factory de operaciones de API key para un tenant.
 */
export function registerManageApikeyRoutes(app, { getTenantById, makeApiKeyOpsFor }) {
  /**
   * Verifica que el usuario sea Superadmin y que el tenant exista.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @returns {Promise<{ tenant: Object, tenantId: string }|null>} Contexto del tenant o null si falla la validación.
   */
  const guardTenant = async (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Solo el Superadmin puede gestionar API keys.'));
      return null;
    }
    const parsed = tenantIdParamSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del tenant es requerido.'));
      return null;
    }
    const tenantId = parsed.data.tenantId;
    const tenant = await getTenantById({ tenantId });
    return { tenant, tenantId };
  };

  app.post('/api-system/v1/tenants/:tenantId/api-key', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const result = await makeApiKeyOpsFor(guard.tenantId).generate();
    return reply.code(201).send(successBody(serialize(apiKeyGeneratedSchema, result)));
  });

  app.get('/api-system/v1/tenants/:tenantId/api-key', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const status = await makeApiKeyOpsFor(guard.tenantId).status();
    return reply.send(successBody(serialize(apiKeyStatusSchema, status)));
  });
}
