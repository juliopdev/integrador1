import { NotFoundError } from '../../../../common/errors.js';
import { resolveDashboardChrome } from '../../../../kernel/dashboard-chrome.js';

/**
 * Rutas SSR de gestión de data del tenant (`/dashboard/data*`). Solo Master/Staff (rango `tenant`).
 * En el apex no aplican (el Superadmin no gestiona data de negocio — eso es dominio del tenant).
 *
 * Iteración inicial: solo el listado de resources del contrato publicado (`GET /dashboard/data`).
 * Los siguientes slices añaden detalle de cada resource, tabla con paginación y formularios de
 * alta/edición (tenant-data.md).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ listResourcesFor: (request: object) => Function, getResourceDetailFor: (request: object) => Function, findRecordsFor: (request: object) => Function, getRecordFor: (request: object) => Function, resolveUserRoleCategories?: (request: object) => object }} deps
 * @returns {void}
 */
export function registerTenantDataViews(app, { listResourcesFor, getResourceDetailFor, findRecordsFor, getRecordFor, resolveUserRoleCategories }) {
  // Redirect a login si no hay sesión de tenant. Si es Superadmin (sin categoría), tampoco.
  const requireTenantUser = async (request, reply) => {
    if (!request.user || request.user.scope !== 'tenant') {
      return reply.redirect('/dashboard/login');
    }
  };

  app.get('/dashboard/data', { preHandler: requireTenantUser }, async (request, reply) => {
    const { contractVersion, resources } = await listResourcesFor(request)();
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/data', userRoleCategories: resolveUserRoleCategories ? resolveUserRoleCategories(request) : null });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/tenant-data/presentation/views/pages/_admin-list-data',
      pageTitle: `Datos · ${chrome.brandTitle}`,
      ...chrome,
      contractVersion,
      resources,
    });
  });

  // Detalle de un resource: schema + records. Si el store del tenant no está configurado, se
  // muestra un estado sin-datos amigable en lugar de un 503 (deletion.md / errors.md).
  app.get('/dashboard/data/:resource', { preHandler: requireTenantUser }, async (request, reply) => {
    const detail = await getResourceDetailFor(request)({ name: request.params.resource });
    if (!detail || detail.manageable === false) {
      throw new NotFoundError('RESOURCE_NOT_FOUND', 'El resource no existe en el contrato publicado o no es gestionable.');
    }

    let records = [];
    let pagination = { limit: 1000, offset: 0, count: 0 };
    let storeError = null;
    try {
      const found = await findRecordsFor(request)({ resource: detail, limit: 1000 });
      records = found.records;
      pagination = found.pagination;
    } catch (err) {
      if (err.code === 'STORE_NOT_CONFIGURED') storeError = err.code;
      else throw err;
    }

    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/data', userRoleCategories: resolveUserRoleCategories ? resolveUserRoleCategories(request) : null });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/tenant-data/presentation/views/pages/_admin-detail-resource',
      pageTitle: `${detail.name} · ${chrome.brandTitle}`,
      ...chrome,
      resource: detail,
      records,
      pagination,
      storeError,
    });
  });

  // Formulario de alta de un record. La sección `_dynamic-form` construye los inputs a partir del
  // schema del resource; el submit va contra `POST /api-system/v1/data/:resource` (api.handler).
  app.get('/dashboard/data/:resource/create', { preHandler: requireTenantUser }, async (request, reply) => {
    const detail = await getResourceDetailFor(request)({ name: request.params.resource });
    if (!detail) {
      throw new NotFoundError('RESOURCE_NOT_FOUND', 'El resource no existe en el contrato publicado.');
    }
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/data', userRoleCategories: resolveUserRoleCategories ? resolveUserRoleCategories(request) : null });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/tenant-data/presentation/views/pages/_admin-create-data',
      pageTitle: `Nuevo · ${detail.name} · ${chrome.brandTitle}`,
      ...chrome,
      resource: detail,
    });
  });

  // Formulario de edición: reusa `_dynamic-form` con `mode='edit'` + `initialValues`. Si el
  // proveedor no está linkeado o el record no existe, mapeo estándar (503/404).
  app.get('/dashboard/data/:resource/:id/edit', { preHandler: requireTenantUser }, async (request, reply) => {
    const detail = await getResourceDetailFor(request)({ name: request.params.resource });
    if (!detail) {
      throw new NotFoundError('RESOURCE_NOT_FOUND', 'El resource no existe en el contrato publicado.');
    }
    const record = await getRecordFor(request)({ resource: detail, id: request.params.id });
    if (!record) {
      throw new NotFoundError('RECORD_NOT_FOUND', 'El record no existe o fue eliminado.');
    }
    const chrome = resolveDashboardChrome(request, { activePath: '/dashboard/data', userRoleCategories: resolveUserRoleCategories ? resolveUserRoleCategories(request) : null });
    return reply.view('frontend/layouts/dashboard', {
      page: 'backend/feature/tenant-data/presentation/views/pages/_admin-edit-data',
      pageTitle: `Editar · ${detail.name} · ${chrome.brandTitle}`,
      ...chrome,
      resource: detail,
      record,
    });
  });
}
