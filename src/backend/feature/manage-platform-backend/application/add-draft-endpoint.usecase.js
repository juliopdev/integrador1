import { DomainError, NotFoundError } from '../../../common/errors.js';
import { HTTP_METHODS, RESERVED_ENDPOINT_SEGMENTS } from '../domain/no-code-constants.js';

const HTTP_METHODS_SET = new Set(HTTP_METHODS);

/**
 * Agrega un endpoint al draft del asistente No-Code (`_step-manage-api`, sub-slice a-3).
 * Reglas mínimas coordinadas con `contract.schema` (dominio); la validación estricta corre en
 * `publish-contract.usecase` al publicar.
 *
 * @param {{ contractRepository: object, now?: () => number }} deps
 * @returns {(params: { path: string, resource: string, methods: string[], access?: Object }) => Promise<{endpoints: {path: string, methods: string[]}[]}>} Función de caso de uso.
 * @throws {DomainError|NotFoundError} `NO_DRAFT` | `RESOURCE_NOT_FOUND` | `INVALID_PATH` |
 *   `RESERVED_PATH` | `INVALID_METHODS` | `DUPLICATE_ENDPOINT`
 */
export function makeAddDraftEndpoint({ contractRepository, now = () => Date.now() }) {
  /**
   * Agrega un endpoint al draft del asistente No-Code.
   * @param {Object} params
   * @param {string} params.path - Ruta del endpoint (ej. "/products").
   * @param {string} params.resource - Nombre del resource al que apunta.
   * @param {string[]} params.methods - Verbos HTTP (GET, POST, PUT, DELETE).
   * @param {Object} [params.access] - Matriz método → audiencias.
   * @returns {Promise<{endpoints: {path: string, methods: string[]}[]>} Lista actualizada de endpoints.
   * @throws {DomainError|NotFoundError} NO_DRAFT | RESOURCE_NOT_FOUND | INVALID_PATH |
   *   RESERVED_PATH | INVALID_METHODS | DUPLICATE_ENDPOINT
   */
  return async function addDraftEndpoint({ path, resource, methods, access }) {
    const draft = contractRepository.getDraft();
    if (!draft) {
      throw new NotFoundError('NO_DRAFT', 'No hay un draft en curso.');
    }
    const resources = draft.schema.resources || [];
    if (!resources.some((r) => r.name === resource)) {
      throw new NotFoundError('RESOURCE_NOT_FOUND', `El draft no contiene el resource "${resource}".`);
    }

    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new DomainError('INVALID_PATH', 'El path debe empezar con "/".');
    }
    const firstSeg = path.split('/').filter(Boolean)[0];
    if (firstSeg && RESERVED_ENDPOINT_SEGMENTS.includes(firstSeg)) {
      throw new DomainError('RESERVED_PATH', `El primer segmento "${firstSeg}" está reservado por el sistema.`);
    }

    const rawMethods = Array.isArray(methods) ? methods : [];
    const normalized = [...new Set(rawMethods.map((m) => String(m).toUpperCase()))];
    if (normalized.length === 0 || normalized.some((m) => !HTTP_METHODS_SET.has(m))) {
      throw new DomainError('INVALID_METHODS', `Al menos un método válido es requerido (${HTTP_METHODS.join(', ')}).`);
    }

    const endpoints = draft.schema.endpoints || [];
    if (endpoints.some((e) => e.path === path)) {
      throw new DomainError('DUPLICATE_ENDPOINT', `El draft ya define un endpoint con path "${path}".`);
    }

    // P7.2: audiencias por método (no-code.md §10). Se filtran a los métodos realmente
    // seleccionados (una audiencia marcada sobre un método sin check se ignora en silencio) y
    // los métodos que quedan solo con "public" no persisten entrada (default v1).
    let cleanAccess;
    if (access && typeof access === 'object') {
      cleanAccess = {};
      for (const m of normalized) {
        const audiences = [...new Set((access[m] || []).map((a) => String(a).trim()).filter(Boolean))];
        if (audiences.length > 0 && !audiences.includes('public')) cleanAccess[m] = audiences;
      }
      if (Object.keys(cleanAccess).length === 0) cleanAccess = undefined;
    }

    const nextEndpoints = [...endpoints, { path, resource, methods: normalized, ...(cleanAccess ? { access: cleanAccess } : {}) }];
    contractRepository.saveDraft({
      version: draft.version,
      schemaJson: JSON.stringify({ ...draft.schema, endpoints: nextEndpoints }),
      now: now(),
    });

    return { endpoints: nextEndpoints.map((e) => ({ path: e.path, methods: e.methods })) };
  };
}
