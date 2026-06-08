import { UserRepositoryContract } from '../../../domain/contracts/user-repository.contract.js';
import { users } from '../../../config/drizzle/schema.js';
import { eq } from 'drizzle-orm';

/**
 * ES: Repositorio de Infraestructura para el Acceso a Usuarios Finales.
 * Realiza operaciones de lectura/escritura exclusivamente sobre la base de datos del inquilino (tenantDb)
 * inyectada dinámicamente en el scope de la solicitud.
 * 
 * EN: Infrastructure Repository for End-Users.
 * Performs read/write operations exclusively on the tenant database (tenantDb)
 * dynamically injected into the request scope.
 */
export class UserRepository extends UserRepositoryContract {
  /**
   * @param {Object} cradle 
   * @param {import('drizzle-orm/better-sqlite3').BetterSQLite3Database} cradle.tenantDb
   */
  constructor({ tenantDb }) {
    super();
    this.tenantDb = tenantDb;
  }

  /**
   * ES: Busca un usuario final por su correo electrónico.
   * EN: Finds an end-user by their email.
   * 
   * @param {string} email 
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email) {
    return await this.tenantDb
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get() || null;
  }

  /**
   * ES: Registra un nuevo usuario final.
   * EN: Registers a new end-user.
   * 
   * @param {Object} userData 
   * @returns {Promise<Object>}
   */
  async create(userData) {
    return await this.tenantDb
      .insert(users)
      .values(userData)
      .returning()
      .get();
  }
}
