import { AuthError, ForbiddenError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que obtiene los datos del Dashboard.
 * Según el scope del usuario (platform o tenant), consulta métricas y logs
 * de la base correspondiente.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.dashboardRepository - Repositorio del dashboard.
 * @returns {(params: { user: Object, db?: Object }) => Promise<{ scope: string, metrics: Array, logs: Array }>} Función de caso de uso.
 * @throws {AuthError} UNAUTHENTICATED - Si no hay usuario autenticado.
 * @throws {ForbiddenError} FORBIDDEN - Si el scope del usuario es desconocido.
 */
export function makeGetDashboardData({ dashboardRepository }) {
  /**
   * Obtiene métricas del dashboard según el ámbito del usuario.
   * Para scope 'platform' consulta métricas globales; para 'tenant' consulta
   * métricas del tenant específico.
   * @param {Object} params - Parámetros de consulta.
   * @param {Object} params.user - Usuario autenticado (debe tener scope).
   * @param {Object} [params.db] - Conexión Drizzle a la base de datos del tenant (requerido para scope 'tenant').
   * @returns {Promise<{ scope: string, metrics: Array, logs: Array }>} Datos del dashboard.
   * @throws {AuthError} UNAUTHENTICATED - Si el usuario no está autenticado.
   * @throws {ForbiddenError} FORBIDDEN - Si el ámbito del usuario es desconocido o no hay DB de tenant.
   */
  return async function getDashboardData({ user, db }) {
    if (!user) {
      throw new AuthError('UNAUTHENTICATED', 'No autenticado.');
    }

    if (user.scope === 'platform') {
      const data = dashboardRepository.getPlatformMetrics(db);
      return {
        scope: 'platform',
        title: 'Mi Baas',
        metrics: [
          { label: 'Tenants Activos', value: data.tenantsCount, icon: 'database' },
          { label: 'Trabajos Pendientes', value: data.pendingJobsCount, icon: 'clock' },
        ],
        logs: data.recentLogs.map((log) => ({
          id: log.id,
          level: log.level,
          message: log.message,
          createdAt: log.createdAt,
        })),
      };
    }

    if (user.scope === 'tenant') {
      if (!db) {
        throw new ForbiddenError('FORBIDDEN', 'Base de datos del tenant no disponible.');
      }
      const data = dashboardRepository.getTenantMetrics(db);
      return {
        scope: 'tenant',
        // El controller o handler de vistas inyectará el nombre real del tenant
        metrics: [
          { label: 'Usuarios', value: data.usersCount, icon: 'users' },
          { label: 'Backends', value: data.backendsCount, icon: 'code' },
          { label: 'API Keys', value: data.apiKeysCount, icon: 'key' },
          { label: 'Roles', value: data.rolesCount, icon: 'shield' },
        ],
        logs: data.recentLogs.map((log) => ({
          id: log.id,
          level: log.level,
          message: log.message,
          createdAt: log.createdAt,
        })),
      };
    }

    throw new ForbiddenError('FORBIDDEN', 'Ámbito de usuario desconocido.');
  };
}
