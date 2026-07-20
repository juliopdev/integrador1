import { errorBody, successBody, serialize } from '../../../../common/responses.js';
import { chatMessagesQuerySchema } from '../validators/in.schema.js';
import { chatMessagesResultSchema } from '../validators/out.schema.js';

/**
 * API endpoints for Tenant Chat.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ getMessagesFor: (request: object) => (params: { channel: string, limit?: number, offset?: number }) => Promise<Array<Object>> }} deps
 * @returns {void}
 */
export function registerChatApiRoutes(app, { getMessagesFor }) {
  const requireTenantUser = async (request, reply) => {
    if (!request.user || request.user.scope !== 'tenant') {
      return reply.code(401).send(errorBody(401, 'UNAUTHORIZED', 'Acceso exclusivo del tenant.'));
    }
  };

  app.get('/api-system/v1/chat/messages', { preHandler: requireTenantUser }, async (request, reply) => {
    const query = chatMessagesQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'channel (string), limit (1-200) y offset (≥0) son requeridos/opcionales.'));
    }
    const { channel, limit, offset } = query.data;
    const messages = await getMessagesFor(request)({ channel, limit, offset });
    return reply.send(successBody(serialize(chatMessagesResultSchema, { messages, pagination: { limit, offset } })));
  });
}
