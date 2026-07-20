import { DomainError } from '../../../common/errors.js';
import { uuidv7 } from '../../../common/id.js';

/**
 * Fábrica para el caso de uso que inserta un nuevo registro dinámico en el almacenamiento del tenant.
 * Compila en caliente el validador dinámico Zod de acuerdo al esquema de la resource, inyecta
 * campos obligatorios de auditoría de dominio (UUIDv7, created_at, updated_at) y persiste la fila en base.
 *
 * @param {Object} deps - Dependencias.
 * @param {Function} deps.resolveStore - Adaptador encargado de resolver el store del cliente.
 * @param {string} deps.tenantId - ID único del tenant space.
 * @param {Object} deps.tenantDb - Instancia de Drizzle conectada a la base de datos del tenant.
 * @param {Function} deps.compileResourceSchema - Compilador de esquemas Zod desde resources del contrato.
 * @returns {(params: { resource: Object, body: Object }) => Promise<Object>} Función de caso de uso.
 */
export function makeInsertDynamicRecord({ resolveStore, tenantId, tenantDb, compileResourceSchema }) {
  /**
   * Crea un nuevo registro dinámico en el store del tenant. Compila un validador Zod
   * dinámico desde la definición del resource, inyecta id (UUIDv7) y timestamps de auditoría.
   * @param {Object} params
   * @param {Object} params.resource - Definición del resource destino.
   * @param {Object} params.body - Datos del registro a insertar.
   * @returns {Promise<Object>} Registro insertado con id y timestamps.
   * @throws {DomainError} Si la validación del body falla.
   */
  return async function insertDynamicRecord({ resource, body }) {
    const schema = compileResourceSchema(resource, { coerce: true });
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new DomainError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Body inválido.');
    }
    const now = Date.now();
    const row = { id: uuidv7(), ...parsed.data, created_at: now, updated_at: now };
    const store = await resolveStore({ tenantId, tenantDb, storeType: resource.store });
    return store.insert(resource.physicalName, row);
  };
}
