import { uuidv7 } from '../../../common/id.js';
import { DomainError, NotFoundError } from '../../../common/errors.js';
import { FIELD_TYPES } from '../domain/no-code-constants.js';

const IDENT = /^[a-z][a-z0-9_]*$/;
const FIELD_TYPES_SET = new Set(FIELD_TYPES);

/**
 * Agrega un field a un resource del draft del asistente No-Code (paso `_step-manage-api`,
 * sub-slice a-2). El **id del field lo genera este use case** (UUIDv7): es crítico para la
 * migración por `field.id` de la Fase 4 (`compile-backend` renombra columnas sin perder data
 * cuando cambia el `name` pero el `id` se mantiene).
 *
 * @param {{ contractRepository: object, now?: () => number, generateId?: () => string }} deps
 * @returns {(params: { resourceName: string, name: string, type: string, required?: boolean, provider?: string, target?: string, defaultValue?: string, unique?: boolean, description?: string, length?: number, check?: string }) => Promise<{resourceName: string, fields: string[]}>} Función de caso de uso.
 * @throws {DomainError|NotFoundError} `NO_DRAFT` | `RESOURCE_NOT_FOUND` | `INVALID_NAME` |
 *   `INVALID_TYPE` | `INVALID_ASSET` | `DUPLICATE_FIELD`
 */
export function makeAddDraftField({ contractRepository, now = () => Date.now(), generateId = uuidv7 }) {
  /**
   * Agrega un field a un resource del draft del asistente No-Code.
   * @param {Object} params
   * @param {string} params.resourceName - Nombre del resource al que agregar el field.
   * @param {string} params.name - Nombre del field (snake_case).
   * @param {string} params.type - Tipo del field (FIELD_TYPES).
   * @param {boolean} [params.required] - Si el campo es requerido.
   * @param {string} [params.provider] - Provider requerido si type='asset'.
   * @param {string} [params.target] - Resource referenciado si type='relation'.
   * @param {string} [params.defaultValue] - Valor por defecto.
   * @param {boolean} [params.unique] - Si agrega UNIQUE constraint.
   * @param {string} [params.description] - Descripción (máx 280 chars).
   * @param {number} [params.length] - Longitud del campo.
   * @param {string} [params.check] - Expresión CHECK.
   * @returns {Promise<{resourceName: string, fields: string[]}>} Resource name + lista de field names.
   * @throws {DomainError|NotFoundError} NO_DRAFT | RESOURCE_NOT_FOUND | INVALID_NAME |
   *   INVALID_TYPE | INVALID_ASSET | DUPLICATE_FIELD
   */
  return async function addDraftField({ resourceName, name, type, required, provider, target, defaultValue, unique, description, length, check }) {
    const draft = contractRepository.getDraft();
    if (!draft) {
      throw new NotFoundError('NO_DRAFT', 'No hay un draft en curso. Agregá primero un resource.');
    }

    const resources = draft.schema.resources || [];
    const idx = resources.findIndex((r) => r.name === resourceName);
    if (idx < 0) {
      throw new NotFoundError('RESOURCE_NOT_FOUND', `El draft no contiene el resource "${resourceName}".`);
    }

    if (!IDENT.test(String(name ?? ''))) {
      throw new DomainError('INVALID_NAME', 'El nombre del field debe ser snake_case.');
    }
    if (!FIELD_TYPES_SET.has(type)) {
      throw new DomainError('INVALID_TYPE', `Tipo inválido. Válidos: ${FIELD_TYPES.join(', ')}.`);
    }
    if (type === 'asset' && !provider) {
      throw new DomainError('INVALID_ASSET', 'Los campos asset requieren un provider (ej. `cloudinary`).');
    }

    const resource = resources[idx];
    if ((resource.fields || []).some((f) => f.name === name)) {
      throw new DomainError('DUPLICATE_FIELD', `El resource "${resourceName}" ya tiene un field "${name}".`);
    }

    // Iter UX P3.2: sanitizamos los avanzados antes de persistir. `defaultValue` viene siempre
    // como string desde el form (`type=text/number/checkbox`); si viene vacío lo omitimos para
    // que el schema JSON no cargue con `""` que confunde al DDL builder. `description` se
    // trunca a 280 (limita al patrón "tweet-length" que el Zod ya valida).
    const trimmedDefault = typeof defaultValue === 'string' ? defaultValue.trim() : undefined;
    const trimmedDescription = typeof description === 'string' ? description.trim().slice(0, 280) : undefined;
    const trimmedCheck = typeof check === 'string' ? check.trim() : undefined;
    const newField = {
      id: generateId(),
      name,
      type,
      required: Boolean(required),
      ...(provider ? { provider } : {}),
      ...(target ? { target } : {}),
      ...(trimmedDefault ? { defaultValue: trimmedDefault } : {}),
      ...(unique ? { unique: true } : {}),
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...(length && Number.isInteger(length) && length > 0 ? { length } : {}),
      ...(trimmedCheck ? { check: trimmedCheck } : {}),
    };
    const updatedResource = { ...resource, fields: [...(resource.fields || []), newField] };
    const nextResources = [...resources];
    nextResources[idx] = updatedResource;

    contractRepository.saveDraft({
      version: draft.version,
      schemaJson: JSON.stringify({ ...draft.schema, resources: nextResources }),
      now: now(),
    });

    return { resourceName, fields: updatedResource.fields.map((f) => f.name) };
  };
}
