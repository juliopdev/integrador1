/**
 * Rutas API de health de la plataforma.
 * @module api.handler
 */

import { errorBody, successBody } from '../../../../common/responses.js';

/**
 * `GET /api-system/v1/health/platform` — snapshot JSON de las métricas del VPS y la plataforma.
 * Superadmin-only. Sirve al polling que hace la vista SSR y a integraciones externas (uptime bots).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ getHealth: Function }} deps
 */
export function registerPlatformHealthApi(app, { getHealth }) {
  app.get('/api-system/v1/health/platform', async (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Sólo el Superadmin puede consultar métricas.'));
    }
    const data = await getHealth();
    return reply.send(successBody(data));
  });
}
