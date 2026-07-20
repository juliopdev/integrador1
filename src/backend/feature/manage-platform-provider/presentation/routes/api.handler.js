import { idParam } from '../../../../common/validators.js';
import {
  linkProviderSchema,
  unlinkProviderParamsSchema,
  unlinkProviderBodySchema,
  updateProviderSettingsSchema,
} from '../validators/in.schema.js';
import { unlinkProviderResultSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';

const tenantIdParamSchema = idParam('tenantId');

/**
 * Registra las rutas de gestión de providers externos por tenant (**solo Superadmin**). Feature
 * separado en el split P8 porque su ciclo de vida es un INSUMO del contrato No-Code, no parte
 * del wizard: el Superadmin puede linkear/deslinkear proveedores en cualquier momento (con guardas
 * contra el contrato publicado — ver `unlink-tenant-provider.usecase.js`).
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @param {Object} deps - Dependencias inyectadas.
 * @param {(params: { tenantId: string }) => Promise<Object>} deps.getTenantById - Caso de uso para obtener un tenant por ID.
 * @param {(tenantId: string) => (params: { category: string, provider: string, config: object }) => Promise<Object>} deps.makeLinkProviderFor
 *   - Factory per-tenant para linkear proveedores.
 * @param {(tenantId: string) => (params: { category: string, provider: string, force?: boolean }) => Promise<Object>} deps.makeUnlinkProviderFor
 *   - Factory per-tenant para deslinkear proveedores.
 * @param {(tenantId: string) => (params: { category: string, provider: string, settings: object }) => Promise<Object>} [deps.makeUpdateSettingsFor]
 *   - Factory per-tenant opcional para actualizar settings de proveedores.
 */
export function registerManageProviderRoutes(app, { getTenantById, makeLinkProviderFor, makeUnlinkProviderFor, makeUpdateSettingsFor }) {
  const guardTenant = async (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Solo el Superadmin puede gestionar providers.'));
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

  app.post('/api-system/v1/tenants/:tenantId/providers', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const parsed = linkProviderSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'category, provider y config son requeridos.'));
    }
    await makeLinkProviderFor(guard.tenantId)(parsed.data); // DomainError → manejador global
    return reply.code(200).send(successBody(null));
  });

  // Guardas anti-footgun (ver `unlink-tenant-provider.usecase.js`):
  //  - Contrato publicado usa el provider → 422 PROVIDER_IN_USE_BY_PUBLISHED (hard block, sin `force`).
  //  - Draft en curso lo usa → 422 PROVIDER_IN_USE_BY_DRAFT; el body `{ force: true }` lo autoriza.
  app.delete('/api-system/v1/tenants/:tenantId/providers/:category/:provider', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const parsed = unlinkProviderParamsSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Parámetros de proveedor inválidos.'));
    }
    const bodyParsed = unlinkProviderBodySchema.safeParse(request.body ?? {});
    const force = bodyParsed.success ? bodyParsed.data.force : false;
    const result = await makeUnlinkProviderFor(guard.tenantId)({ ...parsed.data, force });
    return reply.send(successBody(serialize(unlinkProviderResultSchema, result)));
  });

  // P8.4b: actualizar `settings_json` (políticas del Master — toggles). Los settings viven
  // separados de las credenciales (que van encriptadas en `config_values_json`).
  app.put('/api-system/v1/tenants/:tenantId/providers/:category/:provider/settings', async (request, reply) => {
    const guard = await guardTenant(request, reply);
    if (!guard) return reply;
    const params = unlinkProviderParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Parámetros de proveedor inválidos.'));
    }
    const body = updateProviderSettingsSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'settings es requerido (objeto).'));
    }
    if (!makeUpdateSettingsFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La gestión de settings de providers aún no está cableada.'));
    }
    const result = await makeUpdateSettingsFor(guard.tenantId)({
      category: params.data.category,
      provider: params.data.provider,
      settings: body.data.settings,
    });
    return reply.send(successBody({ category: result.category, provider: result.provider }));
  });
}
