/**
 * Vistas SSR del dashboard de health del Superadmin.
 * @module view.handler
 */

import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';

/**
 * Vista SSR `/dashboard/health` — Superadmin ve un snapshot del VPS y de la plataforma.
 * Slice A: refresco periódico por meta http-equiv (no SSE). Slice B agregará stream vía SSE +
 * gráficos live-updating.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ getHealth: Function }} deps
 */
export function registerPlatformHealthViews(app, { getHealth }) {
  app.get('/dashboard/health', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/health' });
    if (chrome.user?.scope !== 'platform') return reply.redirect('/dashboard');

    const health = await getHealth();
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-health/presentation/views/pages/_platform-health',
      pageTitle: `Health · ${chrome.brandTitle}`,
      ...chrome,
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
      health,
    });
  });
}
