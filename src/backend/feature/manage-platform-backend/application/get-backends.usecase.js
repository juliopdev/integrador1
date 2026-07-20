import { NotFoundError } from '../../../common/errors.js';

/**
 * Fábrica para listar los contratos de backend del tenant.
 * @param {{ contractRepository: object }} deps
 * @returns {(params?: Object) => Promise<Object[]>}
 */
export function makeGetBackends({ contractRepository }) {
  /**
   * Lista los contratos de backend del tenant (versión + estado).
   * @returns {Promise<Object[]>} Lista de contratos.
   */
  return async function getBackends() {
    return contractRepository.list();
  };
}

/**
 * Fábrica para obtener el detalle de un contrato de backend.
 * @param {{ contractRepository: object }} deps
 * @returns {(params: { version: string }) => Promise<{version: string, status: string, schema: Object}>}
 */
export function makeGetBackendDetail({ contractRepository }) {
  /**
   * Obtiene el detalle de un contrato con su schema parseado.
   * @param {Object} params
   * @param {string} params.version - Versión del contrato.
   * @returns {Promise<{version: string, status: string, schema: Object}>} Contrato con schema parseado.
   * @throws {NotFoundError} BACKEND_NOT_FOUND
   */
  return async function getBackendDetail({ version }) {
    const row = contractRepository.getByVersion(version);
    if (!row) throw new NotFoundError('BACKEND_NOT_FOUND', 'No existe un backend con esa versión.');
    return { version: row.version, status: row.status, schema: JSON.parse(row.schemaJson) };
  };
}
