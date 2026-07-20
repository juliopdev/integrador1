import { successBody, errorBody } from '../../common/responses.js';
import { uuidv7 } from '../../common/id.js';
import { compileResourceSchema } from '../../infrastructure/no-code/dynamic-validator.builder.js';
import { buildOpenApi } from '../../infrastructure/no-code/openapi.builder.js';
import { resolveStore } from '../../infrastructure/no-code/store-resolver.js';
import { createContractRepository } from '../../infrastructure/no-code/contract.repository.js';
import { createApiKeyRepository } from '../../feature/manage-platform-apikey/infrastructure/api-key.repository.js';
import { createRoleRepository } from '../../feature/manage-platform-role/infrastructure/role.repository.js';
import { requiredAudiences, resolveAudience, isAllowed } from '../../infrastructure/no-code/access-resolver.js';
import { OWNER_FIELD_NAMES } from '../../feature/manage-platform-backend/domain/no-code-constants.js';

// Tablas físicas ya aseguradas en este proceso (`${tenantId}:${version}:${table}`). MVP: se asegura
// de forma perezosa en el primer request; lo ideal es compilarlas al publicar (no-code.md).
const ensured = new Set();

/**
 * **Dispatcher No-Code** (no-code.md): una ruta comodín `/api/:version/*` sirve toda la API
 * generada. Por request: resuelve el tenant (✅ tenant-loader) → carga el contrato activo → empareja
 * `path`+`method` → **audiencias por método** (P6b: public/user/roles — JWT de User, API key
 * `mbk_…` o roles Staff) → valida el body (Zod compilado) → ejecuta el CRUD contra el store.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 */
export function registerDynamicRouter(app) {
  app.route({ method: ['GET', 'POST', 'PUT', 'DELETE'], url: '/api/:version/*', handler: dispatch });
}

function resolveOwnerField(resource) {
  for (const name of OWNER_FIELD_NAMES) {
    const field = resource.fields?.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (field) return field.name;
  }
  return null;
}

async function dispatch(request, reply) {
  if (!request.tenant) {
    return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Ruta no encontrada.'));
  }

  const { version } = request.params;
  const contract = createContractRepository({ db: request.db }).getActiveContract();
  if (!contract || contract.version !== version) {
    return reply.code(404).send(errorBody(404, 'NO_BACKEND', 'No hay un backend publicado para esta versión.'));
  }

  const segments = String(request.params['*'] ?? '').split('/').filter(Boolean); // ['products'] | ['products','r1']
  const basePath = `/${segments[0] ?? ''}`;
  const id = segments[1];

  // Contrato OpenAPI 3.1 (no-code.md). 'openapi' es palabra reservada, no colisiona con resources.
  if (request.method === 'GET' && segments[0] === 'openapi.json') {
    return reply.send(buildOpenApi(contract.schema));
  }

  const endpoint = contract.schema.endpoints.find((e) => e.path === basePath);
  if (!endpoint) {
    return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Endpoint no encontrado.'));
  }
  if (!endpoint.methods.includes(request.method)) {
    return reply.code(405).send(errorBody(405, 'METHOD_NOT_ALLOWED', `Método ${request.method} no permitido aquí.`));
  }

  // P6b (no-code.md §9 paso 4): audiencias por método. Sin `access` para el método ⇒ público
  // (compatibilidad v1). `user` la satisfacen el JWT de User del tenant o la API key `mbk_…`;
  // los roles Staff salen del JWT scope tenant + user_roles (master = acceso total).
  let isOwnerRequired = false;
  let bypassOwnerCheck = false;
  let callerUserId = null;
  let audience = null;

  const required = requiredAudiences(endpoint, request.method);
  if (required) {
    const apiKeyRepository = createApiKeyRepository({ db: request.db });
    const roleRepository = createRoleRepository({ db: request.db });
    audience = resolveAudience({
      authorization: request.headers.authorization,
      tenantId: request.tenant.id,
      deps: {
        findApiKeyByHash: (hash) => apiKeyRepository.findActiveByHash(hash),
        touchApiKey: (id) => apiKeyRepository.touchLastUsed({ id, now: Date.now() }),
        listRoleNamesForUser: (userId) => roleRepository.listRoleNamesForUser(userId),
      },
    });
    if (!audience) {
      return reply.code(401).send(errorBody(401, 'UNAUTHORIZED', 'Este endpoint requiere autenticación (JWT de User o API key del tenant).'));
    }

    if (required.includes('owner')) {
      isOwnerRequired = true;
      callerUserId = audience.userId;
      if (audience.kind === 'staff' && audience.roles.includes('master')) {
        bypassOwnerCheck = true;
      } else if (audience.kind === 'user' && required.includes('user')) {
        bypassOwnerCheck = true;
      } else if (audience.kind === 'staff' && required.some((r) => audience.roles.includes(r))) {
        bypassOwnerCheck = true;
      }
    }

    if (!isOwnerRequired && !isAllowed(required, audience)) {
      return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Tu credencial no tiene acceso a este método.'));
    }

    if (isOwnerRequired && !bypassOwnerCheck && !callerUserId) {
      return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Este método requiere ser dueño del recurso.'));
    }
  }

  const resource = contract.schema.resources.find((r) => r.name === endpoint.resource);
  const store = await resolveStore({ tenantId: request.tenant.id, tenantDb: request.db, storeType: resource.store });

  const ensureKey = `${request.tenant.id}:${version}:${resource.physicalName}`;
  if (!ensured.has(ensureKey)) {
    await store.ensureResource(resource, contract.schema.resources);
    ensured.add(ensureKey);
  }

  const table = resource.physicalName;
  const now = Date.now();

  if (request.method === 'GET') {
    const isStaff = audience && audience.kind === 'staff';
    const activeField = resource.fields?.find(
      (f) => ['is_active', 'active', 'public'].includes(f.name.toLowerCase())
    );

    if (id) {
      const row = await store.findById(table, id);
      if (!row) {
        return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Recurso no encontrado.'));
      }
      if (!isStaff && activeField && !row[activeField.name]) {
        return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Recurso no encontrado.'));
      }
      if (isOwnerRequired && !bypassOwnerCheck) {
        const ownerField = resolveOwnerField(resource);
        if (!ownerField) {
          return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Este recurso no está configurado para soportar restricción de dueño.'));
        }
        if (String(row[ownerField]) !== String(callerUserId)) {
          return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'No tienes acceso a este recurso.'));
        }
      }
      return reply.send(successBody(row));
    }
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const offset = Number(request.query?.offset) || 0;
    let where = null;
    if (isOwnerRequired && !bypassOwnerCheck) {
      const ownerField = resolveOwnerField(resource);
      if (!ownerField) {
        return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Este recurso no está configurado para soportar restricción de dueño.'));
      }
      where = { [ownerField]: callerUserId };
    }
    if (!isStaff && activeField) {
      where = { ...where, [activeField.name]: true };
    }
    return reply.send(successBody(await store.findMany(table, { limit, offset, where })));
  }

  if (request.method === 'POST') {
    const parsed = compileResourceSchema(resource).safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Body inválido.'));
    }
    if (isOwnerRequired && !bypassOwnerCheck) {
      const ownerField = resolveOwnerField(resource);
      if (!ownerField) {
        return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Este recurso no está configurado para soportar restricción de dueño.'));
      }
      parsed.data[ownerField] = callerUserId;
    }
    try {
      const row = await store.insert(table, { id: uuidv7(), ...parsed.data, created_at: now, updated_at: now });
      return reply.code(201).send(successBody(row));
    } catch (err) {
      return handleDatabaseError(err, reply);
    }
  }

  if (request.method === 'PUT') {
    if (!id) return reply.code(400).send(errorBody(400, 'MISSING_ID', 'Falta el id del recurso.'));
    const parsed = compileResourceSchema(resource, { partial: true }).safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Body inválido.'));
    }
    const ownerField = resolveOwnerField(resource);
    if (isOwnerRequired && !bypassOwnerCheck) {
      if (!ownerField) {
        return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Este recurso no está configurado para soportar restricción de dueño.'));
      }
      const row = await store.findById(table, id);
      if (!row) return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Recurso no encontrado.'));
      if (String(row[ownerField]) !== String(callerUserId)) {
        return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'No tienes acceso a este recurso.'));
      }
    }
    if (ownerField && parsed.data[ownerField] !== undefined) {
      delete parsed.data[ownerField];
    }
    try {
      const row = await store.update(table, id, { ...parsed.data, updated_at: now });
      return row ? reply.send(successBody(row)) : reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Recurso no encontrado.'));
    } catch (err) {
      return handleDatabaseError(err, reply);
    }
  }

  // DELETE
  if (!id) return reply.code(400).send(errorBody(400, 'MISSING_ID', 'Falta el id del recurso.'));
  if (isOwnerRequired && !bypassOwnerCheck) {
    const ownerField = resolveOwnerField(resource);
    if (!ownerField) {
      return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Este recurso no está configurado para soportar restricción de dueño.'));
    }
    const row = await store.findById(table, id);
    if (!row) return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Recurso no encontrado.'));
    if (String(row[ownerField]) !== String(callerUserId)) {
      return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'No tienes acceso a este recurso.'));
    }
  }
  const ok = await store.softDelete(table, id, now);
  return ok ? reply.send(successBody(null)) : reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Recurso no encontrado.'));
}

function handleDatabaseError(err, reply) {
  if (err.code && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return reply.code(422).send(errorBody(422, 'INVALID_RELATION', 'La relación especificada no existe o no es válida (FOREIGN KEY constraint failed).'));
    }
    if (err.code === 'SQLITE_CONSTRAINT_CHECK') {
      return reply.code(422).send(errorBody(422, 'CONSTRAINT_VIOLATION', 'Los datos proporcionados no cumplen con las reglas de validación de la base de datos (CHECK constraint failed).'));
    }
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return reply.code(422).send(errorBody(422, 'UNIQUE_VIOLATION', 'Ya existe un registro con esos datos únicos (UNIQUE constraint failed).'));
    }
    return reply.code(422).send(errorBody(422, 'DATABASE_CONSTRAINT_ERROR', err.message));
  }

  if (err.code) {
    const codeStr = String(err.code);
    if (codeStr === '23503') {
      return reply.code(422).send(errorBody(422, 'INVALID_RELATION', 'La relación especificada no existe o no es válida (FOREIGN KEY constraint failed).'));
    }
    if (codeStr === '23514') {
      return reply.code(422).send(errorBody(422, 'CONSTRAINT_VIOLATION', 'Los datos proporcionados no cumplen con las reglas de validación de la base de datos (CHECK constraint failed).'));
    }
    if (codeStr === '23505') {
      return reply.code(422).send(errorBody(422, 'UNIQUE_VIOLATION', 'Ya existe un registro con esos datos únicos (UNIQUE constraint failed).'));
    }
  }

  throw err;
}
