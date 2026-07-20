import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';

/**
 * Vista SSR de la Biblioteca de medios del Master (`GET /dashboard/gallery`, solo Master).
 * Requiere estar en el subdominio del tenant y con al menos un storage provider linkeado. Sin
 * providers → redirect a `/dashboard` (el sidebar del Master tampoco muestra el link entonces).
 *
 * Filtros por query string: `?page=<n>&limit=<n>&provider=cloudinary|box&type=image|video|audio|document`.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   makeListAssetsFor: (request: object) => (params: { query: object }) => Promise<object>,
 *   resolveUserRoleCategories?: (request: object) => object,
 * }} deps
 * @returns {void}
 */
export function registerTenantGalleryViews(app, { makeListAssetsFor, resolveUserRoleCategories }) {
  app.get('/dashboard/gallery', async (request, reply) => {
    if (!request.user) return reply.redirect('/dashboard/login');
    if (!request.tenant) return reply.redirect('/dashboard'); // apex → superadmin no tiene galería

    const chrome = resolveDashboardChrome(request, {
      activePath: '/dashboard/gallery',
      userRoleCategories: (resolveUserRoleCategories && request.tenant) ? resolveUserRoleCategories(request) : null,
    });
    if (chrome.category !== 'master') return reply.redirect('/dashboard');

    // Sin storage linkeado el sidebar no lo muestra; si llegan por URL directa, redirect.
    // El flag lo popula el hook `tenant-capabilities.hook.js` sobre request.
    if (!chrome.hasStorageProvider) return reply.redirect('/dashboard');

    const { data: assets, meta } = await makeListAssetsFor(request)({ query: request.query ?? {} });

    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-tenant-gallery/presentation/views/pages/_tenant-gallery',
      pageTitle: `Biblioteca de medios · ${chrome.brandTitle}`,
      ...chrome,
      assets,
      pageMeta: meta,
      activeProvider: request.query?.provider ?? null,
      activeType: request.query?.type ?? null,
    });
  });
}
