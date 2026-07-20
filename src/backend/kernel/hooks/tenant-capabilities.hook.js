import { createProviderRepository } from '../../feature/manage-platform-provider/infrastructure/provider-tenant.repository.js';

/**
 * P8.2: hook `preHandler` (per-request) que popula `request.tenantCapabilities` con booleanos
 * derivados de `tenant_providers`. Lo usa `resolveDashboardChrome` para renderizar el sidebar
 * del Master sin que cada view handler tenga que hacer el query él mismo.
 *
 * Ejecuta sólo cuando hay `request.tenant` + `request.user` (Master/Staff en subdominio). En
 * requests apex, del user No-Code (`/api/v1/*`), o sin sesión, no hace nada.
 *
 * Costo: 1 query rápida a `tenant_providers` (indexado por category, pequeño N por tenant). En
 * el futuro se puede cachear en Valkey por tenantId si se detecta bottleneck — hoy es
 * insignificante frente al render EJS.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerTenantCapabilities(app) {
  if (!app.hasRequestDecorator('tenantCapabilities')) {
    app.decorateRequest('tenantCapabilities', null);
  }

  app.addHook('preHandler', async (request) => {
    if (!request.tenant || !request.user || !request.db) return;
    const repo = createProviderRepository({ db: request.db });
    const linked = (repo.list?.() || []).filter((p) => p.enabled);
    request.tenantCapabilities = {
      hasStorageProvider: linked.some((p) => p.category === 'storage'),
      hasAuthProvider: linked.some((p) => p.category === 'auth'),
      hasDatabaseProvider: linked.some((p) => p.category === 'database'),
      // Extender aquí cuando lleguen mail/payments (P8.3/P8.4).
    };
  });
}
