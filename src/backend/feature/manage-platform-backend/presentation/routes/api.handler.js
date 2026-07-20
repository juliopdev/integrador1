/**
 * Rutas API del asistente No-Code para Superadmin.
 * @module api.handler
 */

import {
  startDraftSchema,
  toggleAuthSchema,
  toggleWsSchema,
  tenantIdParamSchema,
  backendVersionParamSchema,
  addDraftResourceSchema,
  updateDraftResourceSchema,
  addDraftFieldSchema,
  addDraftEndpointSchema,
  updateDraftAuthSchema,
} from '../validators/in.schema.js';
import {
  serialize,
  backendListSchema,
  backendDetailSchema,
  publishResultSchema,
  toggleAuthResultSchema,
  toggleWsResultSchema,
  draftSummarySchema,
  draftResourceSummarySchema,
  draftEndpointsSummarySchema,
  draftAuthSummarySchema,
  draftStartResultSchema,
  deleteVersionResultSchema,
  deleteDraftResultSchema,
} from '../validators/out.schema.js';
import { errorBody, successBody } from '../../../../common/responses.js';

/**
 * Rutas del asistente No-Code (**solo Superadmin**, contexto apex). El Superadmin autora desde la
 * plataforma pero **escribe en la base del tenant elegido** (`:tenantId` explícito; no-code.md).
 * Cada caso de uso se compone por petición sobre la conexión de ese tenant.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ getTenantById: Function, makePublishContractFor: Function, makeActivateVersionFor: Function, makeDeleteVersionFor: Function, makeContractOpsFor: Function, makeAddDraftResourceFor: Function, makeDeleteDraftResourceFor: Function, makeUpdateDraftResourceFor: Function, makeDraftFieldOpsFor: Function, makeDraftEndpointOpsFor: Function, makeUpdateDraftAuthFor: Function, makeStartDraftFor: Function, makeAbortDraftFor: Function, deleteDraftFor?: (tenantId: string) => () => Promise<{ deleted: boolean }> }} deps
 */
export function registerManageBackendRoutes(app, { getTenantById, makePublishContractFor, makeActivateVersionFor, makeDeleteVersionFor, makeContractOpsFor, makeAddDraftResourceFor, makeDeleteDraftResourceFor, makeUpdateDraftResourceFor, makeDraftFieldOpsFor, makeDraftEndpointOpsFor, makeUpdateDraftAuthFor, makeStartDraftFor, makeAbortDraftFor, deleteDraftFor = () => async () => ({ deleted: false }) }) {
  // Fallback: si el composition root no cablea `makeAbortDraftFor` (setups de test acotados),
  // caemos al `deleteDraftFor` — pierde el restore de providers pero mantiene compatibilidad.
  const abortDraftFor = makeAbortDraftFor || deleteDraftFor;
  /**
   * Valida el parámetro de ruta `:version` con el schema backendVersionParamSchema.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @returns {Object|null} Datos parseados o null si inválido (responde 400).
   */
  const validateVersionParam = (request, reply) => {
    const parsed = backendVersionParamSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Parámetros de ruta inválidos.'));
      return null;
    }
    return parsed.data;
  };

  /**
   * Guard que verifica scope platform y valida tenantId param.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @returns {Promise<Object|null>} {tenant, tenantId} o null si falla la guardia (responde 400/403).
   */
  const guardTenant = async (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Solo el Superadmin puede componer backends.'));
      return null;
    }
    const parsed = tenantIdParamSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del tenant es requerido.'));
      return null;
    }
    const tenantId = parsed.data.tenantId;
    const tenant = await getTenantById({ tenantId });
    return { tenant, tenantId };
  };

  // Rutas de providers (POST /providers, DELETE /providers/:category/:provider) movidas al
  // feature `manage-platform-provider` en el split (P8). Ver
  // `src/backend/feature/manage-platform-provider/presentation/routes/api.handler.js`.

  // Publicar el contrato del backend (valida la gramática y lo activa). Acepta dos shapes:
  //  (a) API/programático: el body es el contrato en sí (`{ version, resources, ... }`).
  //  (b) SSR wizard: el body viene envuelto en `{ contractJson: "<JSON serializado>" }` porque el
  //      `Form` HTML solo emite strings; se desenvuelve y se parsea aquí.
  app.post('/api-system/v1/tenants/:tenantId/backend', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    let contract = request.body ?? {};
    if (typeof contract.contractJson === 'string') {
      try {
        contract = JSON.parse(contract.contractJson);
      } catch {
        return reply.code(400).send(errorBody(400, 'INVALID_JSON', 'El contrato pegado no es JSON válido.'));
      }
    }
    const { version } = await makePublishContractFor(guard.tenantId)({ contract });
    // Iter UX P2.2: al publicar exitosamente, el draft ya cumplió su función. Se descarta la
    // fila `__draft__` para que `getDraft()` post-publish devuelva `null` y el Paso 1 no muestre
    // "Borrador en curso" sobre un draft fantasma. Este limpieza vive acá — NO en `activateVersion`
    // — porque activar una versión histórica es rollback puro y NO debe descartar el trabajo en
    // curso del asistente (el operador puede volver a componer luego).
    await deleteDraftFor(guard.tenantId)();
    return reply.code(201).send(successBody(serialize(publishResultSchema, { version })));
  });

  // Iter UX: activar una versión existente del historial (rollback o roll-forward). No crea un
  // draft ni recompila desde cero — reutiliza el `schema_json` persistido y lo publica. El motor
  // conserva las columnas físicas (drops ignorados, adds idempotentes) para preservar los datos
  // ya escritos bajo otras versiones. Ver no-code.md §5 y `activate-version.usecase.js`.
  app.post('/api-system/v1/tenants/:tenantId/backend/activate/:version', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const params = validateVersionParam(request, reply);
    if (!params) return reply;
    const result = await makeActivateVersionFor(guard.tenantId)({ version: params.version });
    return reply.code(200).send(successBody(serialize(publishResultSchema, { version: result.version })));
  });

  // Iter UX P2.4: eliminar una versión RETIRED del historial. Rechaza activa/draft/no-existente.
  // La data escrita bajo esta versión NO se toca (el motor conserva columnas físicas — sólo se
  // remueve el snapshot del contrato).
  app.delete('/api-system/v1/tenants/:tenantId/backend/:version', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const params = validateVersionParam(request, reply);
    if (!params) return reply;
    const result = await makeDeleteVersionFor(guard.tenantId)({ version: params.version });
    return reply.code(200).send(successBody(serialize(deleteVersionResultSchema, result)));
  });

  // Rutas de roles (POST /roles, DELETE /roles/:name) movidas al feature `manage-platform-role`
  // en el split (P8). Ver `src/backend/feature/manage-platform-role/presentation/routes/api.handler.js`.

  // Listar / detallar / eliminar (lógico) backends.
  app.get('/api-system/v1/tenants/:tenantId/backends', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const list = await makeContractOpsFor(guard.tenantId).getBackends();
    return reply.send(successBody(serialize(backendListSchema, list)));
  });

  app.get('/api-system/v1/tenants/:tenantId/backends/:version', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const params = validateVersionParam(request, reply);
    if (!params) return reply;
    const detail = await makeContractOpsFor(guard.tenantId).getBackendDetail({ version: params.version });
    return reply.send(successBody(serialize(backendDetailSchema, detail)));
  });

  app.delete('/api-system/v1/tenants/:tenantId/backends/:version', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const params = validateVersionParam(request, reply);
    if (!params) return reply;
    await makeContractOpsFor(guard.tenantId).deleteBackend({ version: params.version });
    return reply.send(successBody(null));
  });

  // Toggles del contrato activo: API Auth de Users y canales WebSocket.
  app.put('/api-system/v1/tenants/:tenantId/backend/auth', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const parsed = toggleAuthSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'enabled (booleano) es requerido.'));
    const result = await makeContractOpsFor(guard.tenantId).toggleApiAuth(parsed.data);
    return reply.send(successBody(serialize(toggleAuthResultSchema, result)));
  });

  app.put('/api-system/v1/tenants/:tenantId/backend/ws', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const parsed = toggleWsSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'channel y enabled son requeridos.'));
    const result = await makeContractOpsFor(guard.tenantId).toggleWsChannel(parsed.data);
    return reply.send(successBody(serialize(toggleWsResultSchema, result)));
  });

  // Draft del asistente: agregar un resource al contrato en construcción.
  app.post('/api-system/v1/tenants/:tenantId/backend/draft/resources', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    if (!makeAddDraftResourceFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La gestión de draft aún no está cableada.'));
    }
    const parsed = addDraftResourceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'name, physicalName y store (sql|nosql) son requeridos.'));
    }
    const summary = await makeAddDraftResourceFor(guard.tenantId)(parsed.data);
    return reply.code(201).send(successBody(serialize(draftSummarySchema, summary)));
  });

  // Draft del asistente: eliminar un resource del contrato en construcción y sus endpoints asociados.
  app.delete('/api-system/v1/tenants/:tenantId/backend/draft/resources/:name', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    if (!makeDeleteDraftResourceFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La eliminación de resources del draft aún no está cableada.'));
    }
    const { name } = request.params;
    const result = await makeDeleteDraftResourceFor(guard.tenantId)({ name });
    return reply.send(successBody(result));
  });

  // Draft del asistente: actualizar un resource en el contrato en construcción y su endpoint asociado.
  app.put('/api-system/v1/tenants/:tenantId/backend/draft/resources/:name', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    if (!makeUpdateDraftResourceFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La actualización de resources del draft aún no está cableada.'));
    }
    const { name } = request.params;
    const parsed = updateDraftResourceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Datos inválidos.'));
    }
    const result = await makeUpdateDraftResourceFor(guard.tenantId)({ name, ...parsed.data });
    return reply.send(successBody(result));
  });

  // Draft: agregar un field a un resource. `:name` es el nombre lógico del resource en el draft.
  app.post('/api-system/v1/tenants/:tenantId/backend/draft/resources/:name/fields', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    if (!makeDraftFieldOpsFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La gestión de fields del draft aún no está cableada.'));
    }
    const parsed = addDraftFieldSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'name y type son requeridos.'));
    }
    const result = await makeDraftFieldOpsFor(guard.tenantId).addField({
      resourceName: request.params.name, ...parsed.data,
    });
    return reply.code(201).send(successBody(serialize(draftResourceSummarySchema, result)));
  });

  // Draft: eliminar un field por su id (identidad estable para la migración por field.id).
  app.delete('/api-system/v1/tenants/:tenantId/backend/draft/resources/:name/fields/:fieldId', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    if (!makeDraftFieldOpsFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La gestión de fields del draft aún no está cableada.'));
    }
    const result = await makeDraftFieldOpsFor(guard.tenantId).deleteField({
      resourceName: request.params.name, fieldId: request.params.fieldId,
    });
    return reply.send(successBody(serialize(draftResourceSummarySchema, result)));
  });

  // Draft (sub-slice a-3): endpoints. `path` va en el body para POST y en base64-url en el DELETE
  // (evita conflictos con `/` en URL params).
  app.post('/api-system/v1/tenants/:tenantId/backend/draft/endpoints', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    if (!makeDraftEndpointOpsFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La gestión de endpoints del draft aún no está cableada.'));
    }
    const parsed = addDraftEndpointSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'path, resource y methods son requeridos.'));
    }
    const result = await makeDraftEndpointOpsFor(guard.tenantId).addEndpoint(parsed.data);
    return reply.code(201).send(successBody(serialize(draftEndpointsSummarySchema, result)));
  });

  app.delete('/api-system/v1/tenants/:tenantId/backend/draft/endpoints/:pathB64', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    if (!makeDraftEndpointOpsFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La gestión de endpoints del draft aún no está cableada.'));
    }
    let path;
    try {
      path = Buffer.from(request.params.pathB64, 'base64url').toString('utf8');
    } catch {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'path codificado en base64url es requerido.'));
    }
    const result = await makeDraftEndpointOpsFor(guard.tenantId).deleteEndpoint({ path });
    return reply.send(successBody(serialize(draftEndpointsSummarySchema, result)));
  });

  // Abortar draft ("Reiniciar" en la UI): restaura `tenant_providers` al snapshot que se capturó
  // en `startDraft` y luego elimina la fila del draft. Esto revierte cualquier linkeo/deslinkeo/
  // cambio de credenciales que el operador hizo DURANTE la edición. Antes sólo borraba el draft y
  // los efectos de linkeo persistían — vector peligroso para credenciales cifradas huérfanas.
  app.delete('/api-system/v1/tenants/:tenantId/backend/draft', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const result = await abortDraftFor(guard.tenantId)();
    return reply.send(successBody(serialize(deleteDraftResultSchema, result)));
  });

  // P7 (paso 1 v2): iniciar el borrador eligiendo modo editar/upgradear.
  app.post('/api-system/v1/tenants/:tenantId/backend/draft/start', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const parsed = startDraftSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'mode debe ser "edit" o "upgrade".'));
    }
    const result = await makeStartDraftFor(guard.tenantId)(parsed.data);
    return reply.code(201).send(successBody(serialize(draftStartResultSchema, result)));
  });

  // Draft (sub-slice a-4): auth de Users. `PUT` porque es un update parcial del sub-objeto `auth`,
  // no un array de items. Deshabilitar limpia strategies + redirectUris (ver use case).
  app.put('/api-system/v1/tenants/:tenantId/backend/draft/auth', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    if (!makeUpdateDraftAuthFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La gestión de auth del draft aún no está cableada.'));
    }
    const parsed = updateDraftAuthSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'userAuthEnabled (booleano) es requerido.'));
    }
    const result = await makeUpdateDraftAuthFor(guard.tenantId)(parsed.data);
    return reply.send(successBody(serialize(draftAuthSummarySchema, result)));
  });

  // ── P4: API key "frontend" del tenant ─────────────────────────────────
  // Movida a `manage-platform-apikey` en el split de features (P8). Ver
  // `src/backend/feature/manage-platform-apikey/presentation/routes/api.handler.js`.
}
