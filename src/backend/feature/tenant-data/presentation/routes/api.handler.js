import { resourceParamSchema, recordParamSchema } from '../validators/in.schema.js';
import { insertRecordResultSchema, updateRecordResultSchema, deleteRecordResultSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';

/**
 * Rutas JSON del CRUD dinámico de `tenant-data` bajo `/api-system/v1/data/:resource*`. Sirve al
 * dashboard SSR (formulario de alta/edición) y a integraciones de plataforma. **Contexto tenant
 * exclusivo**: `session-auth` ya exige `scope='tenant'` en el subdominio; aquí se rechaza
 * cualquier request sin tenant/usuario resuelto. RBAC por endpoint queda a nivel del asistente
 * No-Code (permissions_json) — se aplica cuando esa política esté cableada.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ getResourceDetailFor: Function, insertRecordFor: Function, updateRecordFor: Function, deleteRecordFor: Function, uploadAssetFor?: Function, bulkInsertRecords?: Function }} deps
 * @returns {void}
 */
export function registerTenantDataRoutes(app, { getResourceDetailFor, insertRecordFor, updateRecordFor, deleteRecordFor, uploadAssetFor, bulkInsertRecords }) {
  const guardTenantUser = (request, reply) => {
    if (!request.user || request.user.scope !== 'tenant') {
      reply.code(401).send(errorBody(401, 'UNAUTHENTICATED', 'No autenticado.'));
      return false;
    }
    return true;
  };

  const validateResourceParam = (request, reply) => {
    const parsed = resourceParamSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'El identificador del resource es requerido.'));
      return null;
    }
    return parsed.data.resource;
  };

  const validateRecordParam = (request, reply) => {
    const parsed = recordParamSchema.safeParse(request.params ?? {});
    if (!parsed.success) {
      reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'resource y id son requeridos.'));
      return null;
    }
    return parsed.data;
  };

  const resolveResource = async (request, reply, name) => {
    const resource = await getResourceDetailFor(request)({ name });
    if (!resource || resource.manageable === false) {
      reply.code(404).send(errorBody(404, 'RESOURCE_NOT_FOUND', 'El resource no existe en el contrato publicado o no es gestionable.'));
      return null;
    }
    return resource;
  };

  // POST /api-system/v1/data/:resource — crea un record del resource indicado.
  app.post('/api-system/v1/data/:resource', async (request, reply) => {
    if (!guardTenantUser(request, reply)) return reply;
    const resourceName = validateResourceParam(request, reply);
    if (!resourceName) return reply;

    const resource = await resolveResource(request, reply, resourceName);
    if (!resource) return reply;

    const inserted = await insertRecordFor(request)({ resource, body: request.body ?? {} });
    return reply.code(201).send(successBody(serialize(insertRecordResultSchema, inserted)));
  });

  // POST /api-system/v1/data/:resource/bulk — crea múltiples records a la vez (importación CSV).
  app.post('/api-system/v1/data/:resource/bulk', async (request, reply) => {
    if (!guardTenantUser(request, reply)) return reply;
    const resourceName = validateResourceParam(request, reply);
    if (!resourceName) return reply;

    const resource = await resolveResource(request, reply, resourceName);
    if (!resource) return reply;

    const body = request.body ?? {};
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const mode = body.mode || 'append';
    
    if (rows.length === 0) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Se requiere una lista de registros no vacía.'));
    }

    if (!bulkInsertRecords) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La inserción masiva aún no está configurada.'));
    }

    const { inserted, errors } = await bulkInsertRecords(request)({ resource, rows, mode });

    if (errors.length > 0) {
      return reply.code(400).send(errorBody(400, 'BULK_IMPORT_ERROR', `Error de validación en la fila ${errors[0].index + 1}: ${errors[0].message}`, { errors }));
    }

    return reply.code(201).send(successBody({ count: inserted.length }));
  });

  // PUT /api-system/v1/data/:resource/:id — actualiza parcialmente el record.
  app.put('/api-system/v1/data/:resource/:id', async (request, reply) => {
    if (!guardTenantUser(request, reply)) return reply;
    const params = validateRecordParam(request, reply);
    if (!params) return reply;

    const resource = await resolveResource(request, reply, params.resource);
    if (!resource) return reply;

    const updated = await updateRecordFor(request)({ resource, id: params.id, body: request.body ?? {} });
    return reply.code(200).send(successBody(serialize(updateRecordResultSchema, updated)));
  });

  // DELETE /api-system/v1/data/:resource/:id — soft-delete del record.
  app.delete('/api-system/v1/data/:resource/:id', async (request, reply) => {
    if (!guardTenantUser(request, reply)) return reply;
    const params = validateRecordParam(request, reply);
    if (!params) return reply;

    const resource = await resolveResource(request, reply, params.resource);
    if (!resource) return reply;

    const result = await deleteRecordFor(request)({ resource, id: params.id });
    return reply.code(200).send(successBody(serialize(deleteRecordResultSchema, result)));
  });

  // POST /api-system/v1/data/:resource/upload/:field — sube un asset a Cloudinary y devuelve
  // `{ url, publicId }`. El cliente usa la URL como valor del campo asset al crear/editar el
  // record. Multipart (`file` como fieldname; también acepta `foo` u otro, el handler toma el
  // primer archivo del stream). Provider por default: `cloudinary`.
  app.post('/api-system/v1/data/:resource/upload/:field', async (request, reply) => {
    if (!guardTenantUser(request, reply)) return reply;
    if (!uploadAssetFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La subida de assets aún no está cableada.'));
    }
    if (!request.isMultipart()) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Se requiere multipart/form-data con un archivo.'));
    }

    const resource = await resolveResource(request, reply, request.params.resource);
    if (!resource) return reply;

    // Primer archivo del stream. El plugin ya aplicó el límite de bytes global (12 MB) — errores
    // de tamaño arriba de eso los lanza el plugin como `FST_ERR_FILES_LIMIT` o similar; nuestro
    // usecase también valida ≤10 MB como safeguard extra.
    const filePart = await request.file();
    if (!filePart) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'No se recibió ningún archivo.'));
    }
    const buffer = await filePart.toBuffer();
    const result = await uploadAssetFor(request)({
      resource,
      fieldName: request.params.field,
      buffer,
      mimeType: filePart.mimetype,
      filename: filePart.filename,
    });
    return reply.code(201).send(successBody({ url: result.url, publicId: result.publicId }));
  });
}
