import { inviteStaffSchema, updateRoleSchema, staffUserParamSchema, staffListQuerySchema } from '../validators/in.schema.js';
import { inviteStaffResultSchema, staffListSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';

/**
 * Rutas de gestión de Staff bajo `/api-system/v1/staff` (**solo Master**, vía rbac). El contexto de
 * tenant (`request.db`/`request.tenant`) lo provee el `tenant-loader`; los casos de uso se componen
 * por petición sobre esa conexión. Ver manage-master-staff.md.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ requireMaster: Function, makeInviteStaffFor: Function, makeGetStaffFor: Function, makeUpdateRoleFor: Function, makeDeleteStaffFor: Function }} deps
 */
export function registerStaffRoutes(app, { requireMaster, makeInviteStaffFor, makeGetStaffFor, makeUpdateRoleFor, makeDeleteStaffFor }) {
  // Invitar colaborador.
  app.post('/api-system/v1/staff', { preHandler: requireMaster }, async (request, reply) => {
    const parsed = inviteStaffSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(
        errorBody(400, 'VALIDATION_ERROR', 'Email y rol son requeridos.', parsed.error.flatten().fieldErrors)
      );
    }
    const { userId } = await makeInviteStaffFor(request)(parsed.data); // DomainError → manejador global
    return reply.code(201).send(successBody(serialize(inviteStaffResultSchema, { userId })));
  });

  // Listar colaboradores con sus roles (paginado).
  app.get('/api-system/v1/staff', { preHandler: requireMaster }, async (request, reply) => {
    const query = staffListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'limit (1-100) y offset (≥0) son opcionales.'));
    }
    const { limit, offset } = query.data;
    const data = await makeGetStaffFor(request)({ limit, offset });
    return reply.send(successBody(serialize(staffListSchema, { data, pagination: { limit, offset, count: data.length } })));
  });

  // Asignar/revocar un rol a un colaborador.
  app.put('/api-system/v1/staff/:userId/roles', { preHandler: requireMaster }, async (request, reply) => {
    const params = staffUserParamSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del colaborador es requerido.'));
    }

    const parsed = updateRoleSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(
        errorBody(400, 'VALIDATION_ERROR', 'roleId y action (assign|revoke) son requeridos.', parsed.error.flatten().fieldErrors)
      );
    }
    await makeUpdateRoleFor(request)({ userId: params.data.userId, ...parsed.data });
    return reply.send(successBody(null));
  });

  // Revocar el acceso de un colaborador (soft-delete + invalida sus sesiones).
  app.delete('/api-system/v1/staff/:userId', { preHandler: requireMaster }, async (request, reply) => {
    const params = staffUserParamSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del colaborador es requerido.'));
    }

    await makeDeleteStaffFor(request)({ userId: params.data.userId });
    return reply.send(successBody(null));
  });
}
