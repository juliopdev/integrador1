/**
 * Rutas API de manage-platform-frontend bajo /api-system/v1/frontends/*.
 * @module api.handler
 */

import { tenantIdParamSchema, setExternalSchema } from '../validators/in.schema.js';
import { deployListSchema, setExternalResultSchema, deleteDeployResultSchema, setHostedResultSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';

/**
 * Rutas API de `manage-platform-frontend` bajo `/api-system/v1/frontends/*`. **Exclusivas del
 * Superadmin** (scope='platform'). Sirven la vista SSR de `/dashboard/frontends`.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   getDeploys: Function,
 *   setExternalRedirect: Function,
 *   setHostedDeploy: Function,
 *   deleteFrontendDeploy: Function,
 * }} deps
 */
export function registerManageFrontendRoutes(app, { getDeploys, setExternalRedirect, setHostedDeploy, deleteFrontendDeploy }) {
  /**
   * Verifica que el usuario autenticado tenga scope platform.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @returns {boolean} True si es Superadmin.
   */
  const requireSuperadmin = (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Sólo el Superadmin puede gestionar frontends.'));
      return false;
    }
    return true;
  };

  /**
   * Valida el parámetro de ruta `:tenantId`.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   * @returns {string|null} tenantId o null si inválido.
   */
  const validateTenantParam = (request, reply) => {
    const parsed = tenantIdParamSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'tenantId es requerido.'));
      return null;
    }
    return parsed.data.tenantId;
  };

  // Listado de tenants + su deploy asociado. Alimenta la vista `/dashboard/frontends`.
  app.get('/api-system/v1/frontends', async (request, reply) => {
    if (!requireSuperadmin(request, reply)) return reply;
    const list = await getDeploys();
    return reply.send(successBody(serialize(deployListSchema, list)));
  });

  // Configura modo externo (URL redirect). URL validada en el use case (https, sin puerto, etc.).
  app.put('/api-system/v1/frontends/:tenantId/external', async (request, reply) => {
    if (!requireSuperadmin(request, reply)) return reply;
    const tenantId = validateTenantParam(request, reply);
    if (!tenantId) return reply;
    const parsed = setExternalSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'externalUrl es requerido.', parsed.error.flatten().fieldErrors));
    }
    const result = await setExternalRedirect({ tenantId, externalUrl: parsed.data.externalUrl });
    return reply.send(successBody(serialize(setExternalResultSchema, result)));
  });

  // Configura modo hospedado (subida de archivo ZIP/RAR con index.html + env vars).
  app.put('/api-system/v1/frontends/:tenantId/hosted', async (request, reply) => {
    if (!requireSuperadmin(request, reply)) return reply;
    const tenantId = validateTenantParam(request, reply);
    if (!tenantId) return reply;

    if (!request.isMultipart()) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Se requiere multipart/form-data con un archivo.'));
    }

    let fileBuffer = null;
    let filename = null;
    let envVarsText = '';

    // Procesar partes del multipart (archivo + campos de texto).
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'archive') {
        fileBuffer = await part.toBuffer();
        filename = part.filename;
      } else if (part.type === 'field' && part.fieldname === 'envVars') {
        envVarsText = String(part.value ?? '');
      }
    }

    if (!fileBuffer || !filename) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Se requiere un archivo .zip o .rar en el campo "archive".'));
    }

    const result = await setHostedDeploy({ tenantId, buffer: fileBuffer, filename, envVarsText });
    return reply.send(successBody(serialize(setHostedResultSchema, result)));
  });

  // Elimina la configuración del tenant (frontend + Caddy). NotFound → 404.
  app.delete('/api-system/v1/frontends/:tenantId', async (request, reply) => {
    if (!requireSuperadmin(request, reply)) return reply;
    const tenantId = validateTenantParam(request, reply);
    if (!tenantId) return reply;
    const result = await deleteFrontendDeploy({ tenantId });
    return reply.send(successBody(serialize(deleteDeployResultSchema, result)));
  });
}
