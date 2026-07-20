import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';
import { env } from '../../../../config/env.js';

// Host base + puerto (si aplica) tomado del env — dev: `localhost:3000`, prod: `juliopariona.com`.
// El subdominio del tenant se resuelve como `<sub>.<TENANT_HOST_SUFFIX>` (evita hardcodear `.localhost:3000`).
const TENANT_HOST_SUFFIX = new URL(env.APP_URL).host;

/**
 * Registra las rutas de renderizado SSR del panel de administración de tenants del Superadmin
 * (`/dashboard/tenants`). Carga las vistas del listado, del formulario de creación y de la
 * pantalla de gestión/bitácora del tenant.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia del servidor Fastify.
 * @param {Object} deps - Dependencias inyectadas.
 * @param {() => Promise<Array<Object>>} deps.getTenants - Caso de uso para obtener el listado enriquecido de tenants.
 * @param {(params: { tenantId: string }) => Promise<Object>} deps.getTenantById - Caso de uso para obtener un tenant por ID.
 * @param {() => Promise<Array<Object>>} deps.listPlans - Caso de uso para obtener el catálogo de planes.
 * @param {(tenantId: string) => () => ({ id: string, email: string, status: string }|null)} deps.getMasterFor
 *   - Factory per-tenant que devuelve un caso de uso para obtener los datos del Master.
 */
export function registerManagePlatformTenantViews(app, deps) {
  const { getTenants, getTenantById, listPlans, getMasterFor } = deps;

  const requireSuperadmin = async (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      return reply.redirect('/dashboard/login');
    }
  };

  app.get('/dashboard/tenants', { preHandler: requireSuperadmin }, async (request, reply) => {
    const list = await getTenants();
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/tenants' });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-tenant/presentation/views/pages/_platform-list-tenants',
      pageTitle: `Tenants · ${chrome.brandTitle}`,
      ...chrome,
      tenants: list,
      tenantHostSuffix: TENANT_HOST_SUFFIX,
    });
  });

  app.get('/dashboard/tenants/create', { preHandler: requireSuperadmin }, async (request, reply) => {
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/tenants' });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-tenant/presentation/views/pages/_platform-create-tenant',
      pageTitle: `Crear tenant · ${chrome.brandTitle}`,
      ...chrome,
      // P2: catálogo de contratos para el select del form (referencial, sembrado en la migración).
      plans: await listPlans(),
      tenantHostSuffix: TENANT_HOST_SUFFIX,
    });
  });

  app.get('/dashboard/tenants/:id/update', { preHandler: requireSuperadmin }, async (request, reply) => {
    const tenantId = request.params.id;
    const activeTenant = await getTenantById({ tenantId });

    // Fix seguridad/observabilidad: distinguimos "no hay master aún" (estado válido → 'No asignado')
    // de "no pudimos leer el tenant.db" (bug/corrupción/PRAGMA). Antes ambos casos se fundían
    // silenciosamente en 'No asignado', ocultando fallos serios de infraestructura al Superadmin.
    let masterEmail = 'No asignado';
    let masterStatus = null;
    let masterEmailError = null;
    try {
      const master = getMasterFor(tenantId)(); // { id, email, status } | null
      masterEmail = master?.email ?? 'No asignado';
      masterStatus = master?.status ?? null;
    } catch (err) {
      request.log.error({ err, tenantId }, 'Error al leer el master desde tenant.db');
      masterEmail = null;
      masterEmailError = 'No se pudo leer el tenant.db (revisar logs).';
    }

    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/tenants' });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/manage-platform-tenant/presentation/views/pages/_platform-update-tenant',
      pageTitle: `Gestionar ${activeTenant.subdomain} · ${chrome.brandTitle}`,
      ...chrome,
      activeTenant,
      masterEmail,
      masterStatus,
      masterEmailError,
      tenantHostSuffix: TENANT_HOST_SUFFIX,
    });
  });
}
