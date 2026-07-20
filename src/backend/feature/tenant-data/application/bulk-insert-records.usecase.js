import { DomainError } from '../../../common/errors.js';

/**
 * Inserta múltiples registros de un resource en una sola llamada (importación CSV/bulk).
 * Itera las filas, acumula errores por índice y retorna un resultado parcial.
 * Extraído de `api.handler.js` para mantener los handlers delgados (arch §2).
 *
 * @param {{
 *   insertRecord: (params: { resource: object, body: object }) => Promise<object>,
 * }} deps
 * @returns {(params: { resource: object, rows: object[] }) => Promise<{ inserted: object[], errors: Array<{ index: number, message: string, row: object }> }>}
 */
/**
 * @param {Object} deps
 * @param {(params: { resource: Object, body: Object }) => Promise<Object>} deps.insertRecord
 * @returns {(params: { resource: Object, rows: Object[] }) => Promise<{ inserted: Object[], errors: Array<{ index: number, message: string, row: Object }> }>}
 */
export function makeBulkInsertRecords({ insertRecord, resolveStore, tenantId, tenantDb }) {
  /**
   * Inserta múltiples registros en un resource. Itera filas, acumula errores por índice
   * y retorna resultado parcial con inserted + errors.
   * Admite modo 'overwrite' para limpiar los registros existentes primero.
   * @param {Object} params
   * @param {Object} params.resource - Definición del resource destino.
   * @param {Object[]} params.rows - Lista de registros a insertar.
   * @param {('append'|'overwrite')} [params.mode='append'] - Modo de importación.
   * @returns {Promise<{ inserted: Object[], errors: Array<{ index: number, message: string, row: Object }> }>}
   * @throws {DomainError} Si rows no es un array o está vacío.
   */
  return async function bulkInsertRecords({ resource, rows, mode = 'append' }) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new DomainError('VALIDATION_ERROR', 'Se requiere una lista de registros no vacía.');
    }

    if (mode === 'overwrite' && resolveStore && tenantId && tenantDb) {
      const now = Date.now();
      const store = await resolveStore({ tenantId, tenantDb, storeType: resource.store });
      await store.softDeleteAll(resource.physicalName, now);
    }

    const inserted = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const result = await insertRecord({ resource, body: rows[i] });
        inserted.push(result);
      } catch (err) {
        errors.push({ index: i, message: err.message, row: rows[i] });
      }
    }

    return { inserted, errors };
  };
}
