import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';

/**
 * Vista SSR de gestión de notificaciones del tenant (`GET /dashboard/notifications`).
 * Master/Staff-only: el `chrome.category` resuelve permisos; superadmin no aplica (esta feature es
 * per-tenant). Renderiza compose (publish inmediato / schedule) + tabla de programadas.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ getScheduledFor: (request: object) => (opts?: object) => Promise<Array>, resolveUserRoleCategories?: (request: object) => object }} deps
 * @returns {void}
 */
export function registerTenantNotificationsViews(app, { getScheduledFor, resolveUserRoleCategories }) {
  app.get('/dashboard/notifications', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');

    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/notifications', userRoleCategories: (resolveUserRoleCategories && request.tenant) ? resolveUserRoleCategories(request) : null });
    // Master/Staff del tenant. Superadmin no tiene por qué componer notificaciones per-tenant.
    if (chrome.category !== 'master' && chrome.category !== 'staff') return reply.redirect('/dashboard');

    const scheduled = await getScheduledFor(request)();

    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/tenant-notifications/presentation/views/pages/_master-manage-notifications',
      pageTitle: `${chrome.brandTitle} · Notificaciones`,
      ...chrome,
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
      scheduled,
    });
  });
}
