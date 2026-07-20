import {
  createTenantSchema,
  tenantIdParamSchema,
  setTenantStatusSchema,
  deleteTenantSchema,
  updateTenantSchema,
} from '../validators/in.schema.js';
import { createTenantResultSchema, setTenantStatusResultSchema, updateTenantResultSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';

/**
 * Registra los endpoints HTTP de la API de administración de tenants (`/api-system/v1/tenants`)
 * expuestos únicamente para el rol Superadmin global. Los handlers son delgados: validan la
 * solicitud, delegan al use case y empaquetan la respuesta.
 *
 * La autorización de rol se centraliza en un `preHandler` común (`requireSuperadmin`) aplicado
 * a cada ruta.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @param {Object} deps - Dependencias inyectadas.
 * @param {(params: { subdomain: string, masterEmail: string, projectName?: string, planId?: string }) => Promise<Object>} deps.provisionNewTenant
 *   - Caso de uso que orquesta el alta completa.
 * @param {(params: { tenantId: string, desiredStatus: 'active'|'suspended' }) => Promise<Object>} deps.setTenantStatus
 *   - Caso de uso para establecer estado (active|suspended).
 * @param {(params: { tenantId: string, confirmSubdomain: string }) => Promise<Object>} deps.deleteTenant
 *   - Caso de uso para borrado lógico.
 * @param {(params: { tenantId: string, projectName: string }) => Promise<Object>} deps.updateTenant
 *   - Caso de uso para editar datos del tenant (projectName).
 * @param {(params: { tenantId: string }) => Promise<{ email: string }>} deps.resendMasterInvitation
 *   - Caso de uso para reenviar la invitación del Master.
 */
export function registerManagePlatformTenantRoutes(app, deps) {
  const { provisionNewTenant, setTenantStatus, deleteTenant, updateTenant, resendMasterInvitation } = deps;

  const requireSuperadmin = async (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Solo el Superadmin puede gestionar tenants.'));
    }
  };

  app.post('/api-system/v1/tenants', { preHandler: requireSuperadmin }, async (request, reply) => {
    const parsed = createTenantSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Subdominio y correo del Master son requeridos.'));
    }
    const result = await provisionNewTenant(parsed.data);
    return reply.code(201).send(successBody(serialize(createTenantResultSchema, result)));
  });

  app.patch('/api-system/v1/tenants/:id', { preHandler: requireSuperadmin }, async (request, reply) => {
    const params = tenantIdParamSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del tenant es requerido.'));
    }
    const body = updateTenantSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El nombre del proyecto es requerido (1–80 caracteres).'));
    }
    const result = await updateTenant({ tenantId: params.data.id, projectName: body.data.projectName });
    return reply.code(200).send(successBody(serialize(updateTenantResultSchema, result)));
  });

  // Reenvío de invitación: rate-limit estricto por-ruta (además del gate Superadmin) para acotar
  // el envío de correos (coste/abuso). El use case guarda que el Master siga `invited`.
  app.post('/api-system/v1/tenants/:id/resend-invitation', {
    preHandler: requireSuperadmin,
    config: { rateLimit: { max: 3, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const params = tenantIdParamSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del tenant es requerido.'));
    }
    const result = await resendMasterInvitation({ tenantId: params.data.id });
    return reply.code(200).send(successBody({ email: result.email }));
  });

  app.patch('/api-system/v1/tenants/:id/status', { preHandler: requireSuperadmin }, async (request, reply) => {
    const params = tenantIdParamSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del tenant es requerido.'));
    }
    const body = setTenantStatusSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'desiredStatus debe ser "active" o "suspended".'));
    }
    const result = await setTenantStatus({ tenantId: params.data.id, desiredStatus: body.data.desiredStatus });
    return reply.code(200).send(successBody(serialize(setTenantStatusResultSchema, result)));
  });

  app.delete('/api-system/v1/tenants/:id', { preHandler: requireSuperadmin }, async (request, reply) => {
    const params = tenantIdParamSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del tenant es requerido.'));
    }
    const body = deleteTenantSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'confirmSubdomain es requerido para eliminar un tenant.'));
    }
    await deleteTenant({ tenantId: params.data.id, confirmSubdomain: body.data.confirmSubdomain });
    return reply.code(200).send(successBody(null));
  });
}
