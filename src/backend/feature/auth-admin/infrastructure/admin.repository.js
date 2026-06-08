import { AdminRepositoryContract } from '../../../domain/contracts/admin-repository.contract.js';
import { admins, users } from '../../../config/drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { getTenantDb } from '../../../config/database.js';

/**
 * ES: Repositorio de Infraestructura para el Acceso a Administradores (Superadmin y Master/Staff).
 * Si se especifica un `tenantId`, consulta la base de datos de inquilino aislada en la tabla `users` (filtrando por rol admin).
 * En caso contrario, consulta la base de datos global del sistema (`system.db`) en la tabla `admins`.
 * 
 * EN: Infrastructure Repository for Administrator access (Superadmin and Master/Staff).
 * If a `tenantId` is specified, it queries the isolated tenant database in the `users` table (filtering by admin roles).
 * Otherwise, it queries the global system database (`system.db`) in the `admins` table.
 */
export class AdminRepository extends AdminRepositoryContract {
  /**
   * @param {Object} cradle - ES: Cradle de Awilix. EN: Awilix Cradle.
   * @param {import('drizzle-orm/better-sqlite3').BetterSQLite3Database} cradle.systemDb
   */
  constructor({ systemDb }) {
    super();
    this.systemDb = systemDb;
  }

  /**
   * ES: Busca un administrador por correo electrónico, adaptando el origen de base de datos según el contexto.
   * EN: Finds an administrator by email, adapting the database source according to context.
   * 
   * @param {string} email 
   * @param {string} [tenantId] 
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email, tenantId) {
    if (tenantId) {
      const tenantDb = getTenantDb(tenantId);
      // ES: En base de datos de inquilino, los roles administrativos son 'master' o 'staff'.
      // EN: In tenant database, administrative roles are 'master' or 'staff'.
      const result = tenantDb
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
        .all();

      const user = result[0] || null;
      if (user && (user.role === 'master' || user.role === 'staff')) {
        return user;
      }
      return null;
    }

    // ES: Consulta contra base de datos global (Superadmin).
    // EN: Query against global system database (Superadmin).
    const result = this.systemDb
      .select()
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1)
      .all();
    return result[0] || null;
  }

  /**
   * ES: Registra una nueva cuenta administrativa.
   * EN: Registers a new administrative account.
   * 
   * @param {Object} adminData 
   * @param {string} [tenantId] 
   * @returns {Promise<Object>}
   */
  async create(adminData, tenantId) {
    if (tenantId) {
      const tenantDb = getTenantDb(tenantId);
      const result = tenantDb
        .insert(users)
        .values(adminData)
        .returning()
        .all();
      return result[0];
    }

    const result = this.systemDb
      .insert(admins)
      .values(adminData)
      .returning()
      .all();
    return result[0];
  }
}