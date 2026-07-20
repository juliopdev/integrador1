/**
 * Fábrica para el caso de uso que lista todos los tenants no eliminados de la plataforma.
 * Usa `findAllEnriched()` que resuelve membresía, plan y eventos de estado en una sola query
 * (anti-N+1). El repositorio agrupa las filas planas del JOIN en objetos anidados.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.tenantRepository - Repositorio de tenants de plataforma.
 * @returns {() => Promise<Array<Object>>}
 */
export function makeGetTenants({ tenantRepository }) {
  /**
   * Obtiene la lista de todos los tenants activos (no eliminados) con datos enriquecidos.
   * @returns {Promise<Array<Object>>} Colección de tenants con membresía, plan y eventos de estado.
   */
  return async function getTenants() {
    return tenantRepository.findAllEnriched();
  };
}
