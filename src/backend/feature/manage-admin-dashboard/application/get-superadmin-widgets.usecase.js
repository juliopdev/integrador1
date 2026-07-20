/**
 * Datos del home Superadmin (Iter 53): compone los 5 widgets del landing.
 *
 * - **VPS health**: reusa `getHealth()` de manage-platform-health.
 * - **Errores recientes**: top 3 logs con nivel `error` o `warn`.
 * - **Tenants**: counts agregados + resumen frontends/backends. Sale de `healthRepository.counts()`.
 * - **Actividad reciente**: últimos 5 eventos combinando `tenant_status_events` +
 *   `platform_logs_local` de nivel `info` (publicaciones, jobs completados, etc.). Ordenado por
 *   `createdAt DESC`.
 * - **Acciones rápidas**: estáticas — no requieren data. La vista las hardcodea.
 *
 * Ninguna query es cara. El widget mostrará "0" o "sin eventos" cuando la tabla esté vacía —
 * no falla el render.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {() => Promise<Object>} deps.getHealth - Función para obtener el estado de salud del VPS.
 * @param {Object} deps.healthRepository - Repositorio de salud de la plataforma.
 * @param {Function} deps.healthRepository.counts - Obtiene conteos agregados de la plataforma.
 * @param {Function} deps.healthRepository.readRecentErrors - Obtiene los errores recientes.
 * @param {Function} deps.healthRepository.readRecentActivity - Obtiene la actividad reciente.
 * @returns {() => Promise<{ health: Object, counts: Object, recentErrors: Array, recentActivity: Array }>} Función de caso de uso.
 */
export function makeGetSuperadminWidgets({ getHealth, healthRepository }) {
  /**
   * Compone los widgets del home del Superadmin.
   * Ejecuta en paralelo las consultas de salud, errores recientes y actividad.
   * @returns {Promise<{ health: Object, counts: Object, recentErrors: Array, recentActivity: Array }>}
   */
  return async function getSuperadminWidgets() {
    const [health, recentErrors, recentActivity] = await Promise.all([
      getHealth(),
      Promise.resolve(healthRepository.readRecentErrors()),
      Promise.resolve(healthRepository.readRecentActivity()),
    ]);
    const counts = healthRepository.counts();

    return {
      health,
      counts,
      recentErrors,
      recentActivity,
    };
  };
}
