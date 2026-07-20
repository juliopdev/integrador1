import { eq } from 'drizzle-orm';
import { tenantUsers } from '../../../config/drizzle/schema-tenant.js';

/**
 * Fábrica para el repositorio destructivo per-tenant. Sólo usado por `user.purge` — se aísla del
 * `user.repository` normal para que la API destructiva no se filtre a los use cases de dominio.
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.db - Instancia de Drizzle conectada a la base SQLite del tenant.
 * @returns {{ hardDeleteUser: (userId: string) => number }}
 */
export function createTenantPurgeRepository({ db }) {
  return {
    /**
     * Hard-delete de un `tenant_users` → cascada real sobre `user_roles`.
     * @param {string} userId - ID del usuario a eliminar físicamente.
     * @returns {number} Cantidad de filas eliminadas.
     */
    hardDeleteUser(userId) {
      const res = db.delete(tenantUsers).where(eq(tenantUsers.id, userId)).run();
      return res.changes;
    },
  };
}
