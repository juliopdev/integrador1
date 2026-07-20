/**
 * Fábrica para el caso de uso que lista todos los roles del tenant para el selector de asignación
 * en la vista de Staff. Ver manage-master-staff.md.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.staffRepository - Repositorio de staff del tenant.
 * @returns {() => Promise<Array<Object>>} Función de caso de uso.
 */
export function makeGetStaffRoles({ staffRepository }) {
  /**
   * Obtiene todos los roles del tenant.
   * @returns {Promise<Array<Object>>} Array de roles.
   */
  return async function getStaffRoles() {
    return staffRepository.listAllRoles();
  };
}
