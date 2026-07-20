import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { tenants } from '../../../config/drizzle/schema-platform.js';

/**
 * Fábrica para el repositorio dedicado a las purgas (hard-delete GDPR). Aísla la peligrosa API
 * destructiva del `tenant.repository` normal — nadie llama `hardDelete` por accidente, sólo el
 * job `tenant.purge`.
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.platformDb - Instancia de Drizzle conectada a `platform.db`.
 * @returns {{
 *   listExpiredSoftDeleted: (beforeMs: number) => Array<{ id: string, subdomain: string, deletedAt: number }>,
 *   hardDeleteTenant: (tenantId: string) => number,
 *   countSoftDeleted: () => number,
 * }}
 */
export function createPurgeRepository({ platformDb }) {
  return {
    /**
     * Lista los tenants soft-deleted cuya `deletedAt` es anterior a `beforeMs`. Candidatos a purga.
     * @param {number} beforeMs - Timestamp límite (ms); se listan los eliminados antes de esta fecha.
     * @returns {Array<{ id: string, subdomain: string, deletedAt: number }>}
     */
    listExpiredSoftDeleted(beforeMs) {
      return platformDb
        .select({ id: tenants.id, subdomain: tenants.subdomain, deletedAt: tenants.deletedAt })
        .from(tenants)
        .where(and(isNotNull(tenants.deletedAt), lt(tenants.deletedAt, beforeMs)))
        .all();
    },

    /**
     * Hard-delete físico de un tenant en `platform.db`. Las FK con `ON DELETE CASCADE`
     * (memberships, tenant_status_events, frontend_deploys, api_keys, notifications) caen solas.
     * `deletion.md §4.7`: este es el paso final del pipeline, precedido por la destrucción de
     * recursos externos.
     * @param {string} tenantId - ID del tenant a eliminar físicamente.
     * @returns {number} Cantidad de filas eliminadas en la tabla `tenants`.
     */
    hardDeleteTenant(tenantId) {
      const res = platformDb.delete(tenants).where(eq(tenants.id, tenantId)).run();
      return res.changes;
    },

    /**
     * Diagnóstico: cuántos tenants están soft-deleted actualmente (independiente del cutoff).
     * @returns {number} Cantidad de tenants en estado soft-deleted.
     */
    countSoftDeleted() {
      const row = platformDb.select({ n: sql`count(*)` }).from(tenants).where(isNotNull(tenants.deletedAt)).all()[0];
      return row?.n ?? 0;
    },
  };
}
