/**
 * Vistas SSR del asistente No-Code para Superadmin.
 * @module view.handler
 */

import { NotFoundError } from '../../../../common/errors.js';
import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';
import { WS_CHANNELS, FIELD_TYPES } from '../../domain/no-code-constants.js';
import { PROVIDER_REGISTRY } from '../../../../infrastructure/providers/registry.js';

// P8.5: proyectamos el registry al shape que `_step-manage-provider.ejs` esperaba antes
// (agrupado por categoría, sólo los campos que la vista consume). Cambios al catálogo van al
// registry — esta proyección se auto-actualiza. P8.4b: expone también `settings.fields` para
// que la vista renderice checkboxes/inputs de políticas cuando el provider está linkeado.
const PROVIDER_CATALOG_BY_CATEGORY = PROVIDER_REGISTRY.reduce((acc, desc) => {
  if (!acc[desc.category]) acc[desc.category] = [];
  acc[desc.category].push({
    provider: desc.provider,
    label: desc.label,
    operable: desc.operable,
    fields: desc.fields,
    settings: desc.settings || null,
  });
  return acc;
}, {});

/**
 * Rutas SSR del asistente No-Code (Superadmin) bajo `/dashboard/backends*`. La lista muestra los
 * tenants aprovisionados; el detalle abre el shell del asistente. El **paso actual se deriva del
 * estado ya persistido** en `tenant.db` — sin cookies ni almacenamiento paralelo (motivo y reglas
 * en `.doc/tree/src/backend/feature/manage-platform-backend.md`). `?step=` sigue disponible
 * como override manual para navegación libre + tests.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ getTenants: Function, getTenantById: Function, makeGetWizardStateFor: (tenantId: string) => Function, makeGetBackendStatusFor?: (tenantId: string) => Function, makeGetBackendDetailFor?: (tenantId: string) => Function, makeGetApiKeyStatusFor?: (tenantId: string) => Function }} deps
 */
export function registerManageBackendViews(app, { getTenants, getTenantById, makeGetWizardStateFor, makeGetBackendStatusFor, makeGetBackendDetailFor , makeGetApiKeyStatusFor }) {
  /**
   * Middleware que redirige a login si el usuario no es Superadmin.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @returns {Promise<void>}
   */
  const requireSuperadmin = async (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      return reply.redirect('/dashboard/login');
    }
  };

  // Listado de tenants: acceso al asistente por tenant. Cada tenant lleva su estado del backend
  // (publicado/draft/sin contrato) computado sobre su propia `tenant.db` — una query LRU por tenant.
  app.get('/dashboard/backends', { preHandler: requireSuperadmin }, async (request, reply) => {
    const list = await getTenants();
    const withStatus = await Promise.all(list.map(async (t) => {
      let status = { published: null, draft: null, versionCount: 0 };
      if (makeGetBackendStatusFor) {
        try { status = await makeGetBackendStatusFor(t.id)(); }
        catch { /* si un tenant.db falla, mostramos como "sin datos" y seguimos */ }
      }
      // P5: estado de la API key "frontend" (columna Keys) — mismo criterio best-effort.
      let apiKeyStatus = { exists: false };
      if (makeGetApiKeyStatusFor) {
        try { apiKeyStatus = await makeGetApiKeyStatusFor(t.id)(); }
        catch { /* sin datos */ }
      }
      return { ...t, backendStatus: status, apiKeyStatus };
    }));
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/backends' });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-backend/presentation/views/pages/_platform-list-backends',
      pageTitle: `Backends · ${chrome.brandTitle}`,
      ...chrome,
      tenants: withStatus,
    });
  });

  // Shell del asistente: paso sugerido por defecto (derivado del estado); `?step=` como override.
  app.get('/dashboard/backends/:tenantId', { preHandler: requireSuperadmin }, async (request, reply) => {
    const tenantId = request.params.tenantId;
    const activeTenant = await getTenantById({ tenantId });

    const wizardState = await makeGetWizardStateFor(tenantId)();
    const currentStep = request.query?.step || wizardState.suggestedStep;

    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/backends' });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-backend/presentation/views/pages/_platform-manage-backend',
      pageTitle: `Componer · ${activeTenant.subdomain} · ${chrome.brandTitle}`,
      ...chrome,
      activeTenant,
      currentStep,
      wizardState,
      // Catálogos estáticos (constants.js) inyectados como locals — las vistas EJS no tienen `import`.
      wsChannels: WS_CHANNELS,
      fieldTypes: FIELD_TYPES,
      providerCatalog: PROVIDER_CATALOG_BY_CATEGORY,
    });
  });

  // Iteration 30 (C): detalle read-only de un contrato publicado/retirado. Se llega desde el
  // paso `finish` o desde el historial de versiones del paso `version`.
  app.get('/dashboard/backends/:tenantId/versions/:version', { preHandler: requireSuperadmin }, async (request, reply) => {
    const activeTenant = await getTenantById({ tenantId: request.params.tenantId });
    if (!makeGetBackendDetailFor) {
      throw new NotFoundError('NOT_IMPLEMENTED', 'El detalle de backend no está cableado.');
    }
    const detail = await makeGetBackendDetailFor(activeTenant.id)({ version: request.params.version });
    // El use case ya lanza NotFoundError si no existe → cae al mapeador global.
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/backends' });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-backend/presentation/views/pages/_platform-backend-detail',
      pageTitle: `${activeTenant.subdomain} · ${detail.version} · ${chrome.brandTitle}`,
      ...chrome,
      activeTenant,
      detail,
      // P8: proveedores para la card del resumen visual.
      linkedProviders: (await makeGetWizardStateFor(activeTenant.id)()).linkedProviders,
    });
  });
}
