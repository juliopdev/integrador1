import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';

/**
 * Rutas SSR de chat de soporte del tenant (`/dashboard/chat`).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ resolveUserRoleCategories?: (request: object) => object }} deps
 * @returns {void}
 */
export function registerChatViews(app, { resolveUserRoleCategories } = {}) {
  const requireTenantUser = async (request, reply) => {
    if (!request.user || request.user.scope !== 'tenant') {
      return reply.redirect('/dashboard/login');
    }
  };

  app.get('/dashboard/chat', { preHandler: requireTenantUser }, async (request, reply) => {
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/chat', userRoleCategories: resolveUserRoleCategories ? resolveUserRoleCategories(request) : null });
    
    // Obtener canales de soporte si están configurados en el contrato activo
    const channels = ['ws_support_global']; // Canal de soporte por defecto de la demo

    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/tenant-chat/presentation/views/pages/_tenant-chat',
      pageTitle: `Chat Soporte · ${chrome.brandTitle}`,
      ...chrome,
      channels,
    });
  });
}
