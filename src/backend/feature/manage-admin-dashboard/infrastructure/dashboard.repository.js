import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { tenants, platformLogsLocal, jobs } from '../../../config/drizzle/schema-platform.js';
import { tenantUsers, apiKeys, backendContracts, roles, tenantLogsLocal, notifications, userRoles, tenantProviders } from '../../../config/drizzle/schema-tenant.js';
import { combineRolePermissions } from '../domain/parse-role-permissions.js';

/**
 * Fábrica del repositorio para la visualización del Dashboard.
 * Resuelve las consultas de métricas, widgets y logs locales del sistema y del tenant.
 * Todos los métodos reciben `db` como parámetro: platformDb para métricas de plataforma,
 * o la instancia Drizzle del tenant.db para widgets del home tenant.
 *
 * @returns {DashboardRepository} Objeto con métodos de consulta del dashboard.
 * @example
 * const repo = createDashboardRepository();
 * const metrics = repo.getPlatformMetrics(platformDb);
 */
export function createDashboardRepository() {
  const oneRow = (q) => q.all()[0]?.n ?? 0;

  return {
    // ── Métricas legacy (getDashboardData) ─────────────────────────────

    /**
     * Obtiene métricas de la plataforma global (Superadmin).
     * @param {import('drizzle-orm').DrizzleD1Database} db - Instancia de base de datos de plataforma (platform.db).
     * @returns {{ tenantsCount: number, pendingJobsCount: number, recentLogs: Array<Object> }}
     */
    getPlatformMetrics(db) {
      const tenantsCount = oneRow(
        db.select({ count: sql`COUNT(*)` }).from(tenants).where(isNull(tenants.deletedAt)),
      );

      const pendingJobsCount = oneRow(
        db.select({ count: sql`COUNT(*)` }).from(jobs).where(eq(jobs.status, 'pending')),
      );

      const recentLogs = db
        .select()
        .from(platformLogsLocal)
        .orderBy(desc(platformLogsLocal.createdAt))
        .limit(10)
        .all();

      return {
        tenantsCount,
        pendingJobsCount,
        recentLogs,
      };
    },

    /**
     * Obtiene métricas de un tenant específico.
     * @param {import('drizzle-orm').DrizzleD1Database} db - Instancia de base de datos del tenant (tenant.db).
     * @returns {{ usersCount: number, apiKeysCount: number, backendsCount: number, rolesCount: number, recentLogs: Array<Object> }}
     */
    getTenantMetrics(db) {
      const usersCount = oneRow(
        db.select({ count: sql`COUNT(*)` }).from(tenantUsers).where(isNull(tenantUsers.deletedAt)),
      );

      const apiKeysCount = oneRow(
        db.select({ count: sql`COUNT(*)` }).from(apiKeys).where(eq(apiKeys.status, 'active')),
      );

      const backendsCount = oneRow(
        db.select({ count: sql`COUNT(*)` }).from(backendContracts),
      );

      const rolesCount = oneRow(
        db.select({ count: sql`COUNT(*)` }).from(roles),
      );

      const recentLogs = db
        .select()
        .from(tenantLogsLocal)
        .orderBy(desc(tenantLogsLocal.createdAt))
        .limit(10)
        .all();

      return {
        usersCount,
        apiKeysCount,
        backendsCount,
        rolesCount,
        recentLogs,
      };
    },

    // ── Widgets del home Master/Staff (get-tenant-widgets) ─────────────

    /**
     * Lee el contrato publicado del tenant y devuelve un resumen ligero.
     * @param {import('drizzle-orm').DrizzleD1Database} db - Drizzle del tenant.db.
     * @returns {{ isPublished: boolean, version: string|null, resourceCount: number, publishedAt: number|null }}
     */
    readContract(db) {
      const row = db
        .select({
          version: backendContracts.version,
          schemaJson: backendContracts.schemaJson,
          publishedAt: backendContracts.publishedAt,
          updatedAt: backendContracts.updatedAt,
        })
        .from(backendContracts)
        .where(eq(backendContracts.status, 'published'))
        .orderBy(desc(backendContracts.publishedAt))
        .limit(1)
        .all()[0];
      if (!row) return { isPublished: false, version: null, resourceCount: 0 };
      let resourceCount = 0;
      try {
        const parsed = row.schemaJson ? JSON.parse(row.schemaJson) : null;
        resourceCount = Array.isArray(parsed?.resources) ? parsed.resources.length : 0;
      } catch {
        // schemaJson corrupto — no rompemos el home; mostramos 0.
      }
      return { isPublished: true, version: row.version, resourceCount, publishedAt: row.publishedAt };
    },

    /**
     * Lista los proveedores activos del tenant.
     * @param {import('drizzle-orm').DrizzleD1Database} db - Drizzle del tenant.db.
     * @returns {Array<{ category: string, provider: string }>}
     */
    readProvidersActive(db) {
      return db
        .select({ category: tenantProviders.category, provider: tenantProviders.provider })
        .from(tenantProviders)
        .where(eq(tenantProviders.enabled, 1))
        .all();
    },

    /**
     * Agregados del tenant: usuarios totales, staff, notificaciones, actividad del día.
     * @param {import('drizzle-orm').DrizzleD1Database} db - Drizzle del tenant.db.
     * @param {number} now - Timestamp actual en ms.
     * @returns {{ endUsers: number, staff: number, notificationsPublished: number, usersJoinedToday: number, usersRemovedToday: number }}
     */
    readCounts(db, now) {
      const staff = oneRow(
        db.select({ n: sql`count(distinct ${userRoles.userId})` })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .innerJoin(tenantUsers, eq(userRoles.userId, tenantUsers.id))
          .where(and(
            isNull(tenantUsers.deletedAt),
            sql`${roles.category} in ('master', 'staff')`,
          )),
      );

      const totalUsers = oneRow(
        db.select({ n: sql`count(*)` }).from(tenantUsers).where(isNull(tenantUsers.deletedAt)),
      );

      const notificationsPublished = oneRow(
        db.select({ n: sql`count(*)` }).from(notifications).where(eq(notifications.status, 'published')),
      );

      // Delta diario: start-of-day en ms epoch (00:00 local del server — MVP).
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const sodMs = startOfDay.getTime();

      const usersJoinedToday = oneRow(
        db.select({ n: sql`count(*)` }).from(tenantUsers)
          .where(and(gte(tenantUsers.createdAt, sodMs), isNull(tenantUsers.deletedAt))),
      );
      const usersRemovedToday = oneRow(
        db.select({ n: sql`count(*)` }).from(tenantUsers)
          .where(and(gte(tenantUsers.deletedAt, sodMs), isNotNull(tenantUsers.deletedAt))),
      );

      const endUsers = Math.max(0, totalUsers - staff);

      return { endUsers, staff, notificationsPublished, usersJoinedToday, usersRemovedToday };
    },

    /**
     * Actividad reciente agnóstica: últimas 5 notificaciones publicadas + últimos 5 usuarios activados,
     * mezclados por `at` DESC, top 5.
     * @param {import('drizzle-orm').DrizzleD1Database} db - Drizzle del tenant.db.
     * @param {number} now - Timestamp actual en ms.
     * @returns {Array<{ kind: string, message: string, at: number }>}
     */
    readRecentActivity(db, now) {
      const nowMs = now;
      const notifs = db
        .select({
          id: notifications.id,
          title: notifications.title,
          publishedAt: notifications.publishedAt,
        })
        .from(notifications)
        .where(eq(notifications.status, 'published'))
        .orderBy(desc(notifications.publishedAt))
        .limit(5)
        .all();

      const users = db
        .select({
          id: tenantUsers.id,
          email: tenantUsers.email,
          createdAt: tenantUsers.createdAt,
        })
        .from(tenantUsers)
        .where(and(isNull(tenantUsers.deletedAt), eq(tenantUsers.status, 'active')))
        .orderBy(desc(tenantUsers.createdAt))
        .limit(5)
        .all();

      const events = [
        ...notifs.filter((n) => n.publishedAt != null).map((n) => ({
          kind: 'notification.published',
          message: `Publicaste "${n.title}"`,
          at: n.publishedAt,
        })),
        ...users.map((u) => ({
          kind: 'user.joined',
          message: `${maskEmail(u.email)} se unió`,
          at: u.createdAt,
        })),
      ];

      return events
        .filter((e) => Number.isFinite(e.at) && e.at <= nowMs)
        .sort((a, b) => b.at - a.at)
        .slice(0, 5);
    },

    /**
     * "Asistencia del equipo" MVP: staff con `updatedAt` como proxy de última actividad.
     * Top 5, DESC. Los emails se enmascaran por privacidad.
     * @param {import('drizzle-orm').DrizzleD1Database} db - Drizzle del tenant.db.
     * @returns {Array<{ email: string, updatedAt: number, status: string }>}
     */
    readTeamAttendance(db) {
      return db
        .select({
          id: tenantUsers.id,
          email: tenantUsers.email,
          updatedAt: tenantUsers.updatedAt,
          status: tenantUsers.status,
        })
        .from(tenantUsers)
        .innerJoin(userRoles, eq(userRoles.userId, tenantUsers.id))
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(
          isNull(tenantUsers.deletedAt),
          sql`${roles.category} in ('master', 'staff')`,
        ))
        .orderBy(desc(tenantUsers.updatedAt))
        .limit(5)
        .all()
        .map((r) => ({ email: maskEmail(r.email), updatedAt: r.updatedAt, status: r.status }));
    },

    /**
     * Lee los roles asignados al user y compone los flags binarios que el home Staff usa para
     * decidir qué tiles mostrar. Un user sin roles → todos los flags en `false`.
     * @param {import('drizzle-orm').DrizzleD1Database} db - Drizzle del tenant.db.
     * @param {string} userId - ID del usuario a consultar.
     * @returns {{ hasReadAccess: boolean, hasAnyDataAccess: boolean, isSupport: boolean }}
     */
    readUserPermissions(db, userId) {
      const rows = db
        .select({ name: roles.name, permissionsJson: roles.permissionsJson })
        .from(roles)
        .innerJoin(userRoles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId))
        .all();
      return combineRolePermissions(rows);
    },
  };
}

/**
 * Muestra parcial del email para actividad (privacy-friendly): `ju***@shop.com`.
 * @param {string} email - Correo a enmascarar.
 * @returns {string} Email enmascarado.
 * @example
 * maskEmail('juan@shop.com') // 'ju***@shop.com'
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${local.length > 2 ? '***' : ''}@${domain}`;
}
