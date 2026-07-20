import { DomainError, NotFoundError } from '../../../common/errors.js';

const IDENT = /^[a-z][a-z0-9_]*$/;
const VALID_STORES = new Set(['sql', 'nosql']);
const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

/**
 * Deriva el shape efectivo del endpoint a partir del override opcional.
 * @param {string} name - Nombre del resource.
 * @param {Object} [override] - Override del endpoint.
 * @param {string} [override.path] - Ruta custom.
 * @param {string[]} [override.methods] - Métodos custom.
 * @param {Object} [override.access] - Matriz de acceso custom.
 * @returns {{ path: string, resource: string, methods: string[], access: Object }}
 */
function resolveEndpoint(name, override) {
  const path = (override?.path && String(override.path).trim()) || `/${name}`;
  const methods = Array.isArray(override?.methods) && override.methods.length
    ? [...new Set(override.methods.map((m) => String(m).toUpperCase()).filter((m) => VALID_METHODS.has(m)))]
    : ['GET', 'POST', 'PUT', 'DELETE'];

  const defaultAccess = {
    GET: ['master', 'user'],
    POST: ['master'],
    PUT: ['master'],
    DELETE: ['master'],
  };
  const access = {};
  for (const m of methods) {
    const roles = override?.access?.[m];
    if (Array.isArray(roles) && roles.length) {
      access[m] = [...new Set(roles.map((r) => String(r)).filter(Boolean))];
    } else {
      access[m] = defaultAccess[m] || ['master'];
    }
  }

  return { path, resource: name, methods, access };
}

/**
 * Actualiza un resource en el draft del contrato y su endpoint asociado.
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { name: string, newName?: string, physicalName?: string, store: string, endpoint?: Object, manageable?: boolean }) => Promise<{version: string, name: string}>} Función de caso de uso.
 */
export function makeUpdateDraftResource({ contractRepository, now = () => Date.now() }) {
  /**
   * Actualiza un resource en el draft del contrato y su endpoint asociado.
   * @param {Object} params
   * @param {string} params.name - Nombre actual del resource a actualizar.
   * @param {string} [params.newName] - Nuevo nombre (si renombra).
   * @param {string} [params.physicalName] - Nuevo nombre físico.
   * @param {string} params.store - Tipo de store ("sql" | "nosql").
   * @param {Object} [params.endpoint] - Config del endpoint asociado.
   * @param {boolean} [params.manageable] - Si es gestionable desde UI.
   * @returns {Promise<{version: string, name: string}>} Versión del draft + nombre del resource.
   * @throws {DomainError|NotFoundError} NO_DRAFT | RESOURCE_NOT_FOUND | INVALID_NAME |
   *   INVALID_STORE | DUPLICATE_RESOURCE | INVALID_PATH | INVALID_METHODS | DUPLICATE_ENDPOINT
   */
  return async function updateDraftResource({ name, newName, physicalName, store, endpoint, manageable }) {
    const draft = contractRepository.getDraft();
    if (!draft) {
      throw new NotFoundError('NO_DRAFT', 'No hay un draft en curso.');
    }

    const resources = draft.schema.resources || [];
    const idx = resources.findIndex((r) => r.name === name);
    if (idx < 0) {
      throw new NotFoundError('RESOURCE_NOT_FOUND', `El draft no contiene el resource "${name}".`);
    }

    const targetName = newName || name;
    const physical = physicalName || (IDENT.test(String(targetName)) ? `${targetName}_db` : physicalName);

    if (!IDENT.test(String(targetName)) || !IDENT.test(String(physical))) {
      throw new DomainError('INVALID_NAME', 'name y physicalName deben ser snake_case.');
    }
    if (!VALID_STORES.has(store)) {
      throw new DomainError('INVALID_STORE', 'store debe ser "sql" o "nosql".');
    }

    // Si cambia de nombre, validar duplicados en otros recursos
    if (newName && newName !== name) {
      if (resources.some((r) => r.name === newName)) {
        throw new DomainError('DUPLICATE_RESOURCE', `El draft ya tiene un resource "${newName}".`);
      }
    }

    const resolvedEndpoint = resolveEndpoint(targetName, endpoint);
    if (!resolvedEndpoint.path.startsWith('/')) {
      throw new DomainError('INVALID_PATH', 'El path del endpoint debe empezar con "/".');
    }
    if (resolvedEndpoint.methods.length === 0) {
      throw new DomainError('INVALID_METHODS', 'Elegí al menos un método HTTP para el endpoint.');
    }

    // Validar colisión de paths con otros endpoints
    const endpoints = draft.schema.endpoints || [];
    const otherEndpoints = endpoints.filter((e) => e.resource !== name);
    if (otherEndpoints.some((e) => e.path === resolvedEndpoint.path)) {
      throw new DomainError('DUPLICATE_ENDPOINT', `Ya hay un endpoint en el path "${resolvedEndpoint.path}".`);
    }

    // Actualizar recursos
    const nextResources = resources.map((r, i) => {
      if (i !== idx) {
        // Renombrar relaciones si este recurso se renombra
        if (newName && newName !== name && Array.isArray(r.fields)) {
          const nextFields = r.fields.map((f) => {
            if (f.type === 'relation' && f.target === name) {
              return { ...f, target: newName };
            }
            return f;
          });
          return { ...r, fields: nextFields };
        }
        return r;
      }
      return {
        ...r,
        name: targetName,
        physicalName: physical,
        store,
        manageable: manageable !== false,
      };
    });

    // Actualizar endpoints
    const nextEndpoints = endpoints.map((e) => {
      if (e.resource === name) {
        return resolvedEndpoint;
      }
      return e;
    });

    // Si no existía endpoint previo (caso raro), añadir el nuevo
    if (!endpoints.some((e) => e.resource === name)) {
      nextEndpoints.push(resolvedEndpoint);
    }

    const nextSchema = {
      ...draft.schema,
      resources: nextResources,
      endpoints: nextEndpoints,
    };

    contractRepository.saveDraft({
      version: draft.version,
      schemaJson: JSON.stringify(nextSchema),
      now: now(),
    });

    return { version: draft.version, name: targetName };
  };
}
