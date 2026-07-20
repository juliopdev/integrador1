import { publishSchema, updateScheduleSchema, listQuerySchema } from '../validators/in.schema.js';
import {
  notificationPublicSchema,
  notificationListSchema,
  notificationScheduledListSchema,
  notificationCreateResultSchema,
  notificationCancelResultSchema,
} from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';

/**
 * Rutas HTTP de tenant-notifications:
 *
 * - `POST   /api-system/v1/notifications` (Master/Staff): si viene `scheduledAt` → schedule
 *   (encola job en `platform.db.jobs`); sino → publish inmediato + difusión WS.
 * - `GET    /api-system/v1/notifications/scheduled` (Master/Staff): listado interno de programadas.
 * - `PUT    /api-system/v1/notifications/scheduled/:id` (Master/Staff): edita programada + re-agenda job.
 * - `DELETE /api-system/v1/notifications/scheduled/:id` (Master/Staff): cancela + elimina job pendiente.
 * - `GET    /api/:version/notifications` (público / autenticado): feed paginado del end-user.
 *
 * Contexto tenant obligatorio en todas: `tenant-loader` resuelve `request.tenant`. En apex → 404.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   publishFor: (request: object) => Function,
 *   scheduleFor: (request: object) => Function,
 *   getLatestFor: (request: object) => Function,
 *   getScheduledFor: (request: object) => Function,
 *   updateScheduleFor: (request: object) => Function,
 *   deleteScheduleFor: (request: object) => Function,
 * }} deps
 * @returns {void}
 */
export function registerTenantNotificationsRoutes(app, {
  publishFor, scheduleFor, getLatestFor, getScheduledFor, updateScheduleFor, deleteScheduleFor,
}) {
  const requireTenantContext = (request, reply) => {
    if (!request.tenant) {
      reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Ruta no encontrada.'));
      return false;
    }
    return true;
  };

  const requireTenantStaff = (request, reply) => {
    if (!request.user || request.user.scope !== 'tenant') {
      reply.code(401).send(errorBody(401, 'UNAUTHENTICATED', 'No autenticado.'));
      return false;
    }
    return true;
  };

  // Crea notificación — Master/Staff (scope='tenant'). Con `scheduledAt` futuro → schedule (encola
  // job en platform.db); sin él → publish inmediato + broadcast por WS. Ambos casos best-effort
  // en la difusión / encolado (no bloquean el 201 si el broker falla).
  app.post('/api-system/v1/notifications', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    if (!requireTenantStaff(request, reply)) return reply;
    const parsed = publishSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'title, body y audience válidos son requeridos.', parsed.error.flatten().fieldErrors));
    }
    const { scheduledAt, ...rest } = parsed.data;
    const author = { id: request.user.id ?? request.user.sub, email: request.user.email };
    const created = scheduledAt != null
      ? await scheduleFor(request)({ ...rest, scheduledAt, author })
      : await publishFor(request)({ ...rest, author });
    return reply.code(201).send(successBody(serialize(notificationCreateResultSchema, created)));
  });

  // Listado de programadas — Master/Staff. Ordenado por `scheduledAt ASC` (próxima primero).
  app.get('/api-system/v1/notifications/scheduled', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    if (!requireTenantStaff(request, reply)) return reply;
    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Query inválida.'));
    }
    const list = await getScheduledFor(request)(parsed.data);
    return reply.send(successBody(serialize(notificationScheduledListSchema, list)));
  });

  // Edita una programada. Patch parcial (title/body/audience/scheduledAt). Si mueve la hora,
  // re-agenda el job. NotFoundError → 404, DomainError → 422 (mapper global).
  app.put('/api-system/v1/notifications/scheduled/:id', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    if (!requireTenantStaff(request, reply)) return reply;
    const parsed = updateScheduleSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Patch inválido.', parsed.error.flatten().fieldErrors));
    }
    const updated = await updateScheduleFor(request)({ id: request.params.id, patch: parsed.data });
    return reply.send(successBody(updated));
  });

  // Cancela una programada. Idempotente sólo desde 'scheduled': ya publicada/cancelada → 404.
  app.delete('/api-system/v1/notifications/scheduled/:id', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    if (!requireTenantStaff(request, reply)) return reply;
    const result = await deleteScheduleFor(request)({ id: request.params.id });
    return reply.send(successBody(serialize(notificationCancelResultSchema, result)));
  });

  // Feed público del tenant. NO exige auth — el `audience='authenticated'` se filtra dentro:
  // el use case sólo lo incluye cuando `isAuthenticated=true` (scope='user' del tenant actual).
  app.get('/api/:version/notifications', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    const parsedQuery = listQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Query inválida.'));
    }
    const isAuthenticated = Boolean(request.user && request.user.scope === 'user' && request.user.tenantId === request.tenant.id);
    const list = await getLatestFor(request)({ ...parsedQuery.data, isAuthenticated });
    return reply.send(successBody(serialize(notificationListSchema, list)));
  });
}
