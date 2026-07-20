/**
 * Fábrica para el caso de uso que lista el catálogo de planes disponibles.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.tenantRepository - Repositorio de tenants de plataforma.
 * @returns {() => Promise<Array<Object>>}
 */
export function makeListPlans({ tenantRepository }) {
  /**
   * Obtiene el catálogo completo de planes ordenado cronológicamente.
   * @returns {Promise<Array<Object>>} Lista de planes disponibles.
   */
  return async function listPlans() {
    return tenantRepository.listPlans();
  };
}
