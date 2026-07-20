/**
 * Fábrica para el caso de uso que lista los colaboradores del tenant con sus roles activos, con paginación.
 * Clamp: limit ∈ [1, 100], offset ≥ 0. Ver manage-master-staff.md.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.staffRepository - Repositorio de staff del tenant.
 * @returns {(params?: { limit?: number, offset?: number }) => Promise<Array<{ id: string, email: string, status: string, roles: Array<string> }>>} Función de caso de uso.
 */
export function makeGetStaffMembers({ staffRepository }) {
  /**
   * Obtiene la lista paginada de colaboradores con sus roles.
   * @param {Object} [params] - Parámetros de paginación.
   * @param {number} [params.limit=20] - Cantidad máxima de resultados (clamped 1-100).
   * @param {number} [params.offset=0] - Desplazamiento para paginación.
   * @returns {Promise<Array<{ id: string, email: string, status: string, roles: Array<string> }>>}
   */
  return async function getStaffMembers({ limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return staffRepository.listStaffWithRoles({ limit: safeLimit, offset: safeOffset });
  };
}
