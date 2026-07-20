import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';
import { createContractRepository } from '../../../../infrastructure/no-code/contract.repository.js';

/**
 * Rutas SSR del Dashboard (`/dashboard`).
 * - Iter 53: Superadmin usa `getSuperadminWidgets` (widgets de resumen de plataforma).
 * - Iter 54: Master/Staff usa `getTenantWidgetsFor(request)` (home agnóstico del dominio).
 * - Legacy `getDashboardData` sigue como fallback si `getTenantWidgetsFor` no está inyectado.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   getDashboardData: Function,
 *   getSuperadminWidgets?: Function,
 *   getTenantWidgetsFor?: (request: object) => Function,
 *   resolveDashboardDb: (request: object) => object,
 *   resolveUserRoleCategories?: (request: object) => Object|null,
 * }} deps
 */
export function registerDashboardViews(app, {
  getDashboardData, getSuperadminWidgets, getTenantWidgetsFor, resolveDashboardDb, resolveUserRoleCategories,
}) {
  const handler = async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');
    // Aislamiento de scope: `/dashboard` es superficie de admin. Una identidad que no sea
    // platform/tenant (p.ej. un end-user scope 'user') no tiene panel → a login, en vez de caer al
    // fallback legacy `getDashboardData` que respondía 403 "ámbito desconocido".
    if (request.user.scope !== 'platform' && request.user.scope !== 'tenant') {
      return reply.redirect('/dashboard/login');
    }
    const userRoleCategories = (request.tenant && resolveUserRoleCategories)
      ? resolveUserRoleCategories(request)
      : null;
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard', userRoleCategories });

    const view = {
      page: 'backend/feature/manage-admin-dashboard/presentation/views/pages/_admin-home',
      pageTitle: `Inicio · ${chrome.brandTitle}`,
      ...chrome,
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
    };

    if (request.user.scope === 'platform' && getSuperadminWidgets) {
      const w = await getSuperadminWidgets();
      Object.assign(view, {
        health: w.health,
        counts: w.counts,
        recentErrors: w.recentErrors,
        recentActivity: w.recentActivity,
      });
    } else if (request.user.scope === 'tenant' && getTenantWidgetsFor) {
      // Iter 54b: le pasamos el userId al use case para que resuelva `permissions` (Staff filtra
      // sus tiles con esos flags).
      const w = await getTenantWidgetsFor(request)({ userId: request.user.id ?? request.user.sub });
      Object.assign(view, {
        contract: w.contract,
        counts: w.counts,
        webHealth: w.webHealth,
        teamAttendance: w.teamAttendance,
        recentActivity: w.recentActivity,
        permissions: w.permissions,
      });
    } else {
      const dashboardData = await getDashboardData({
        user: request.user,
        db: resolveDashboardDb(request),
      });
      Object.assign(view, {
        metrics: dashboardData.metrics,
        logs: dashboardData.logs,
      });
    }

    return reply.view('frontend/layouts/dashboard', view);
  };

  app.get('/dashboard', handler);
  app.get('/dashboard/', handler);

  // Iter 54b Slice A: placeholder de `/dashboard/metrics`. La página real (auditoría con
  // `tenant_audit_log`) llega en Slice B. Por ahora redirige a `/dashboard/data` con toast query
  // que la vista del listado interpreta para mostrar "próximamente" al operador.
  app.get('/dashboard/metrics', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');
    if (request.user.scope !== 'tenant') return reply.redirect('/dashboard');
    return reply.redirect('/dashboard/data?feature=metrics-soon');
  });

  app.get('/dashboard/docs', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');
    if (request.user.scope !== 'tenant') return reply.redirect('/dashboard');

    const userRoleCategories = (request.tenant && resolveUserRoleCategories)
      ? resolveUserRoleCategories(request)
      : null;

    if (userRoleCategories?.category !== 'master') {
      return reply.redirect('/dashboard');
    }

    const contractRepo = createContractRepository({ db: request.db });
    const contract = contractRepo.getActiveContract();

    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/docs', userRoleCategories });

    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-admin-dashboard/presentation/views/pages/_admin-docs',
      pageTitle: `Documentación Técnica · ${chrome.brandTitle}`,
      ...chrome,
      contract,
    });
  });
}
