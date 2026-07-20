import { idParam } from '../../../../common/validators.js';
import { createRoleSchema } from '../validators/in.schema.js';
import { createRoleResultSchema, deleteRoleResultSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';

const tenantIdParamSchema = idParam('tenantId');

/**
 * Registra las rutas de RBAC del tenant (**solo Superadmin**). Crea/elimina roles Staff que el
 * Master luego asigna. Los roles referencian permisos por (version, endpoint, verbos); se compilan
 * al publicar el contrato (ver `compile-access-to-roles`).
 *
 * Feature separado (split P8) porque su ciclo de vida es independiente del contrato — Superadmin
 * puede crear/borrar roles con o sin borrador en curso.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @param {Object} deps - Dependencias inyectadas.
 * @param {(params: { tenantId: string }) => Promise<Object>} deps.getTenantById - Caso de uso para obtener un tenant por ID.
 * @param {(tenantId: string) => (params: { name: string, permissions?: Object }) => Promise<Object>} deps.makeConfigureRoleFor
 *   - Factory per-tenant para crear roles.
 * @param {(tenantId: string) => (params: { name: string }) => Promise<Object>} deps.makeDeleteRoleFor
 *   - Factory per-tenant para eliminar roles.
 */
export function registerManageRoleRoutes(app, { getTenantById, makeConfigureRoleFor, makeDeleteRoleFor }) {
  const guardTenant = async (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Solo el Superadmin puede gestionar roles.'));
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

  app.post('/api-system/v1/tenants/:tenantId/roles', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const parsed = createRoleSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'name y permissions (matriz endpoint→verbos) son requeridos.'));
    }
    const role = await makeConfigureRoleFor(guard.tenantId)(parsed.data);
    return reply.code(201).send(successBody(serialize(createRoleResultSchema, role)));
  });

  app.delete('/api-system/v1/tenants/:tenantId/roles/:name', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const name = String(request.params?.name ?? '').trim();
    if (!name) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El nombre del rol es requerido.'));
    }
    const result = await makeDeleteRoleFor(guard.tenantId)({ name });
    return reply.send(successBody(serialize(deleteRoleResultSchema, result)));
  });
}
