import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';

/**
 * Registra las rutas SSR del dashboard de logs de plataforma.
 * `/dashboard/logs` — Superadmin ve los logs de plataforma con filtro por nivel y paginación por
 * cursor `before` (`?before=<ms>`). Slice A: refresh SSR; Slice B agregará SSE stream.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @param {Object} deps - Dependencias inyectadas.
 * @param {(params?: { level?: string|null, before?: string|number|null, limit?: number }) =>
 *   Promise<{ logs: Array<object>, counts: { total: number, info: number, warn: number, error: number } }>} deps.getLogs
 *   - Caso de uso de listado de logs.
 */
export function registerPlatformLogViews(app, { getLogs }) {
  app.get('/dashboard/logs', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/logs' });
    if (chrome.user?.scope !== 'platform') return reply.redirect('/dashboard');

    const level = request.query?.level ?? null;
    const before = request.query?.before ?? null;
    const { logs, counts } = await getLogs({ level, before, limit: 50 });

    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-log/presentation/views/pages/_platform-logs',
      pageTitle: `Logs · ${chrome.brandTitle}`,
      ...chrome,
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
      logs, counts,
      selectedLevel: level,
      nextBefore: logs.length > 0 ? logs[logs.length - 1].createdAt : null,
    });
  });
}
