/**
 * Vistas SSR de gestión de frontends del Superadmin.
 * @module view.handler
 */

import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';
import { errorBody } from '../../../../common/responses.js';
import { env } from '../../../../config/env.js';

// Host base + puerto tomado del env (dev: `localhost:3000`, prod: `juliopariona.com`). Se pasa a la
// vista para renderizar `<sub>.<suffix>` y el link "Visitar" del frontend hospedado.
const TENANT_HOST_SUFFIX = new URL(env.APP_URL).host;

/**
 * Vistas SSR de gestión de frontends del Superadmin. Superadmin-only: cualquier otro rol → /dashboard.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ getDeploys: Function, getDeployFor: Function }} deps
 */
export function registerManageFrontendViews(app, { getDeploys, getDeployFor }) {
  app.get('/dashboard/frontends', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/frontends' });
    if (chrome.user?.scope !== 'platform') return reply.redirect('/dashboard');

    const deploys = await getDeploys();
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-frontend/presentation/views/pages/_platform-list-frontends',
      pageTitle: `Frontends · ${chrome.brandTitle}`,
      ...chrome,
      skin: request.query?.skin ?? undefined,
      mode: request.query?.mode ?? undefined,
      deploys,
      tenantHostSuffix: TENANT_HOST_SUFFIX,
    });
  });

  app.get('/dashboard/frontends/:tenantId', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/frontends' });
    if (chrome.user?.scope !== 'platform') return reply.redirect('/dashboard');

    try {
      const { tenant, deploy } = await getDeployFor(request.params.tenantId);
      return reply.view('frontend/layouts/dashboard', {
        page: 'backend/feature/manage-platform-frontend/presentation/views/pages/_platform-manage-frontend',
        pageTitle: `Frontend · ${tenant.subdomain} · ${chrome.brandTitle}`,
        ...chrome,
        skin: request.query?.skin ?? undefined,
        mode: request.query?.mode ?? undefined,
        tenant,
        deploy,
      });
    } catch (err) {
      if (err?.code === 'TENANT_NOT_FOUND') return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'El tenant no existe.'));
      throw err;
    }
  });
}
