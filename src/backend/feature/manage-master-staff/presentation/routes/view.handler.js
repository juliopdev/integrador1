import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';

/**
 * Vista SSR de gestión de Staff (`GET /dashboard/staff`, solo Master). El layout y el menú lateral los
 * provee dashboard.ejs vía el chrome compartido; la página lista a los colaboradores del tenant.
 * Ver manage-master-staff.md.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia Fastify.
 * @param {Object} deps - Dependencias del handler.
 * @param {(request: object) => () => Promise<Array>} deps.getStaffFor - Factory que retorna función para listar staff.
 * @param {(request: object) => () => Promise<Array>} deps.getStaffRolesFor - Factory que retorna función para listar roles.
 * @param {(request: object) => object} deps.resolveUserRoleCategories - Resuelve categorías del usuario.
 */
export function registerStaffViews(app, { getStaffFor, getStaffRolesFor, resolveUserRoleCategories }) {
  app.get('/dashboard/staff', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login'); // flows.md

    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/staff', userRoleCategories: (resolveUserRoleCategories && request.tenant) ? resolveUserRoleCategories(request) : null });
    // La gestión de Staff es exclusiva del Master; el resto vuelve a su panel (no es un 403 de API).
    if (chrome.category !== 'master') return reply.redirect('/dashboard');

    const staff = await getStaffFor(request)();
    const rolesList = await getStaffRolesFor(request)();

    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-master-staff/presentation/views/pages/_master-manage-staff',
      pageTitle: `Staff · ${chrome.brandTitle}`,
      ...chrome,
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
      staff,
      rolesList,
    });
  });
}
