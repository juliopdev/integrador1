import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { tenants, platformUsers, memberships, frontendDeploys, jobs, platformLogsLocal, tenantStatusEvents } from '../../../config/drizzle/schema-platform.js';

/**
 * Repositorio de conteos agregados que alimentan el dashboard de health y los widgets del
 * Superadmin. Todas las lecturas son agregaciones baratas (COUNT sobre tabla indexada) — sirven
 * un snapshot instantáneo.
 *
 * `backend_contracts` no existe en `platform.db` (vive en cada `tenant.db`) — la métrica agregada
 * de backends publicados llegará cuando el agente de métricas escanee tenants. Por ahora el count
 * de backends es `null` para no engañar al operador.
 *
 * @param {{ db: object }} deps - Instancia de Drizzle conectada a `platform.db`.
 */
export function createHealthRepository({ db }) {
  return {
    /**
     * Retorna conteos agregados de la plataforma (tenants, superadmins, frontends, etc.).
     * @returns {{tenants: {active: number, suspended: number, softDeleted: number}, superadmins: number, memberships: number, frontends: {hosted: number, external: number}, backends: null}}
     */
    counts() {
      const oneRow = (q) => q.all()[0]?.n ?? 0;
      const active = oneRow(db.select({ n: sql`count(*)` }).from(tenants).where(and(isNull(tenants.deletedAt), eq(tenants.status, 'active'))));
      const suspended = oneRow(db.select({ n: sql`count(*)` }).from(tenants).where(and(isNull(tenants.deletedAt), eq(tenants.status, 'suspended'))));
      const softDeleted = oneRow(db.select({ n: sql`count(*)` }).from(tenants).where(isNotNull(tenants.deletedAt)));
      const superadmins = oneRow(db.select({ n: sql`count(*)` }).from(platformUsers).where(isNull(platformUsers.deletedAt)));
      const membershipsCount = oneRow(db.select({ n: sql`count(*)` }).from(memberships));
      const frontendsHosted = oneRow(db.select({ n: sql`count(*)` }).from(frontendDeploys).where(eq(frontendDeploys.mode, 'hosted')));
      const frontendsExternal = oneRow(db.select({ n: sql`count(*)` }).from(frontendDeploys).where(eq(frontendDeploys.mode, 'external')));
      return {
        tenants: { active, suspended, softDeleted },
        superadmins,
        memberships: membershipsCount,
        frontends: { hosted: frontendsHosted, external: frontendsExternal },
        backends: null, // placeholder: vive en tenant.db, no agregable barato desde acá
      };
    },

    /**
     * Iter 55: resumen del worker de jobs — counts por status + últimos 5 completados/failed.
     * Todo agregado sobre la tabla `jobs` (platform.db) con índice en (status, availableAt).
     */
    /**
     * Resumen del worker de jobs: counts por status + últimos 5 completados/failed.
     * @returns {{byStatus: {pending: number, processing: number, completed: number, failed: number}, recent: Object[]}}
     */
    jobsSummary() {
      const oneRow = (q) => q.all()[0]?.n ?? 0;
      const byStatus = {
        pending: oneRow(db.select({ n: sql`count(*)` }).from(jobs).where(eq(jobs.status, 'pending'))),
        processing: oneRow(db.select({ n: sql`count(*)` }).from(jobs).where(eq(jobs.status, 'processing'))),
        completed: oneRow(db.select({ n: sql`count(*)` }).from(jobs).where(eq(jobs.status, 'completed'))),
        failed: oneRow(db.select({ n: sql`count(*)` }).from(jobs).where(eq(jobs.status, 'failed'))),
      };
      const recent = db
        .select({
          id: jobs.id, type: jobs.type, status: jobs.status,
          tenantId: jobs.tenantId, attempts: jobs.attempts,
          lastError: jobs.lastError, updatedAt: jobs.updatedAt,
        })
        .from(jobs)
        .where(inArray(jobs.status, ['completed', 'failed']))
        .orderBy(desc(jobs.updatedAt))
        .limit(5)
        .all();
      return { byStatus, recent };
    },

    // ── Widgets del home Superadmin (get-superadmin-widgets) ───────────

    /**
     * Últimos 3 logs con nivel `error` o `warn` (feed de errores del widget Superadmin).
     */
    /**
     * Últimos 3 logs con nivel error o warn.
     * @returns {Object[]} Lista de errores recientes.
     */
    readRecentErrors() {
      return db
        .select({
          id: platformLogsLocal.id,
          level: platformLogsLocal.level,
          message: platformLogsLocal.message,
          createdAt: platformLogsLocal.createdAt,
        })
        .from(platformLogsLocal)
        .where(inArray(platformLogsLocal.level, ['error', 'warn']))
        .orderBy(desc(platformLogsLocal.createdAt))
        .limit(3)
        .all();
    },

    /**
     * Actividad reciente del Superadmin: últimos 5 eventos de `tenant_status_events`
     * combinados con logs de nivel `info`. Mapeados a la forma
     * `{ kind, message, createdAt, subdomain? }` ordenados DESC.
     */
    /**
     * Actividad reciente del Superadmin: últimos 5 eventos de tenant_status_events.
     * @returns {{kind: string, message: string, subdomain: string|null, createdAt: number}[]}
     */
    readRecentActivity() {
      const events = db
        .select({
          id: tenantStatusEvents.id,
          event: tenantStatusEvents.event,
          createdAt: tenantStatusEvents.createdAt,
          subdomain: tenants.subdomain,
        })
        .from(tenantStatusEvents)
        .leftJoin(tenants, eq(tenantStatusEvents.tenantId, tenants.id))
        .orderBy(desc(tenantStatusEvents.createdAt))
        .limit(5)
        .all()
        .map((row) => ({
          kind: `tenant.${row.event}`,
          message: buildTenantEventMessage(row.event, row.subdomain),
          subdomain: row.subdomain,
          createdAt: row.createdAt,
        }));
      return events;
    },
  };
}

/**
 * Construye un mensaje legible para un evento de tenant.
 * @param {string} event - Tipo de evento ("created" | "enabled" | "disabled").
 * @param {string|null} subdomain - Subdominio del tenant.
 * @returns {string} Mensaje descriptivo del evento.
 */
function buildTenantEventMessage(event, subdomain) {
  const name = subdomain ? `\`${subdomain}\`` : 'un tenant';
  if (event === 'created') return `Se creó ${name}`;
  if (event === 'enabled') return `Se reactivó ${name}`;
  if (event === 'disabled') return `Se suspendió ${name}`;
  return `Evento ${event} sobre ${name}`;
}
