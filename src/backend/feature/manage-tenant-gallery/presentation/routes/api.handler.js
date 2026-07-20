import { assetIdParamSchema } from '../validators/in.schema.js';
import { deleteAssetResultSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';
import { requireCategory } from '../../../../kernel/hooks/rbac-validator.hook.js';

/**
 * Rutas mutativas de la Biblioteca de medios del Master (P8.2). Vive bajo `/api-system/v1/*` con
 * scope tenant — el session-auth resuelve `platform_sid` / `tenant_sid` según subdominio. El
 * guard `requireCategory('master')` valida contra `user_roles` del tenant.db.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ deleteAssetFor: (request: object) => (params: { id: string }) => Promise<object> }} deps
 * @returns {void}
 */
export function registerManageTenantGalleryRoutes(app, { deleteAssetFor }) {
  const requireMaster = requireCategory('master');

  app.delete('/api-system/v1/assets/:id', { preHandler: requireMaster }, async (request, reply) => {
    const params = assetIdParamSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El id del asset es requerido.'));
    }
    if (!request.tenant?.id) {
      return reply.code(400).send(errorBody(400, 'TENANT_REQUIRED', 'Esta acción requiere estar en el subdominio de un tenant.'));
    }
    const deleteAsset = deleteAssetFor(request);
    const result = await deleteAsset({ id: params.data.id });
    return reply.send(successBody(serialize(deleteAssetResultSchema, result)));
  });
}
