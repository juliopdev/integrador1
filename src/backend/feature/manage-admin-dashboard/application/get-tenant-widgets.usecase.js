/**
 * Home Master/Staff (Iter 54 + 54b): **agnóstico del dominio**. NADA acá asume "ecommerce", "bolsa
 * laboral", "videos", etc. Los datos concretos salen del contrato No-Code del tenant + tablas de
 * sistema comunes a todo tenant.
 *
 * Iter 54b amplía el snapshot para los widgets rediseñados:
 * - `webHealth` (widget "Salud de mi web"): derivado del `tenant.db` — backend publicado +
 *   providers activos + user-auth habilitada. **Sin probes reales** (no llamamos a URLs, no
 *   medimos latencia); eso llega en Slice B con un cron job dedicado.
 * - `counts.usersJoinedToday` / `usersRemovedToday`: pulso diario, delta desde start-of-day local
 *   (usamos ms epoch de `Date` para no depender de TZ del sqlite).
 * - `teamAttendance`: staff/master con `updatedAt` como proxy de "última actividad". **No es
 *   duración de sesión** — es el último cambio (activación, borrado lógico, etc.). El widget
 *   rotula esto honestamente. Slice B añadirá `tenant_sessions_log`.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.dashboardRepository - Repositorio con métodos de query para widgets.
 * @param {Object} deps.db - Conexión Drizzle al tenant.db.
 * @param {() => number} [deps.now] - Función que devuelve el timestamp actual (mockeable en tests).
 * @returns {(params?: { userId?: string | null }) => Promise<Object>} Función de caso de uso.
 */
export function makeGetTenantWidgets({ dashboardRepository, db, now = () => Date.now() }) {
  /**
   * Compone los widgets del home para Master/Staff.
   * Lee el contrato, proveedores activos, conteos, actividad reciente,
   * asistencia del equipo y permisos del usuario, todo del tenant.db.
   * @param {Object} [params] - Parámetros opcionales.
   * @param {string|null} [params.userId=null] - ID del usuario para resolver permisos (Staff).
   * @returns {Promise<{ contract: Object, counts: Object, recentActivity: Array, teamAttendance: Array, permissions: Object|null, webHealth: Object }>}
   */
  return async function getTenantWidgets({ userId = null } = {}) {
    const contract = dashboardRepository.readContract(db);
    const providersActive = dashboardRepository.readProvidersActive(db);
    const counts = dashboardRepository.readCounts(db, now());
    const recentActivity = dashboardRepository.readRecentActivity(db, now());
    const teamAttendance = dashboardRepository.readTeamAttendance(db);
    const permissions = userId ? dashboardRepository.readUserPermissions(db, userId) : null;

    return {
      contract,
      counts,
      recentActivity,
      teamAttendance,
      permissions,
      webHealth: {
        backend: contract, // reusa el shape
        providersActive,
        userAuthEnabled: providersActive.some((p) => p.category === 'auth'),
      },
    };
  };
}
