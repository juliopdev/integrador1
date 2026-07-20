import { DomainError } from '../../../common/errors.js';

/**
 * Elimina físicamente una versión RETIRED del historial del tenant. Iter UX P2.4.
 *
 * Reglas:
 *   - No se puede eliminar la versión publicada (VERSION_IS_ACTIVE) — para eso primero hay que
 *     activar otra versión desde el historial.
 *   - No se puede eliminar el draft (VERSION_IS_DRAFT) — para eso está `/backend/draft` DELETE.
 *   - Si la versión no existe, retorna 404 (VERSION_NOT_FOUND).
 *
 * ATENCIÓN: el motor No-Code no dropea columnas físicas al retirar/eliminar una versión (ver
 * `no-code.md §5`). Los datos escritos bajo esta versión permanecen en las tablas del proveedor
 * de storage. Eliminar acá sólo remueve el snapshot del contrato — no toca la data de negocio.
 *
 * @param {{ contractRepository: object }} deps
 * @returns {(params: { version: string }) => Promise<{version: string, deleted: boolean}>} Función de caso de uso.
 */
export function makeDeleteVersion({ contractRepository }) {
  /**
   * Elimina físicamente una versión RETIRED del historial del tenant.
   * @param {Object} params
   * @param {string} params.version - Versión a eliminar (ej. "v2").
   * @returns {Promise<{version: string, deleted: boolean}>} Versión eliminada y resultado.
   * @throws {DomainError} VERSION_IS_ACTIVE | VERSION_NOT_FOUND | VERSION_IS_DRAFT
   */
  return async function deleteVersion({ version }) {
    const active = contractRepository.getActiveContract();
    if (active && active.version === version) {
      throw new DomainError('VERSION_IS_ACTIVE', `${version} es la versión publicada. Activá otra versión antes de eliminarla.`);
    }
    const row = contractRepository.getByVersion(version);
    if (!row) {
      throw new DomainError('VERSION_NOT_FOUND', `No existe la versión ${version} en el historial.`);
    }
    if (row.status === 'draft') {
      throw new DomainError('VERSION_IS_DRAFT', 'El borrador se descarta desde "Reiniciar", no desde el historial.');
    }
    const deleted = contractRepository.deleteByVersion(version);
    return { version, deleted };
  };
}
