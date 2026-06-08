import { TenantRepositoryContract } from '../../../domain/contracts/tenant-repository.contract.js';
import { tenants } from '../../../config/drizzle/schema.js';
import { eq } from 'drizzle-orm';

/**
 * ES: Repositorio de Infraestructura para la gestión de inquilinos en la base de datos global (system.db).
 * EN: Infrastructure Repository for tenant management in the global database (system.db).
 */
export class TenantRepository extends TenantRepositoryContract {
  /**
   * @param {Object} cradle
   * @param {import('drizzle-orm/better-sqlite3').BetterSQLite3Database} cradle.systemDb
   */
  constructor({ systemDb }) {
    super();
    this.systemDb = systemDb;
  }

  /**
   * ES: Registra o inserta un nuevo inquilino en system.db.
   * EN: Registers or inserts a new tenant in system.db.
   * 
   * @param {Object} tenantData 
   * @returns {Promise<Object>}
   */
  async create(tenantData) {
    const result = this.systemDb
      .insert(tenants)
      .values(tenantData)
      .returning()
      .all();
    return result[0];
  }

  /**
   * ES: Busca un inquilino por su identificador único.
   * EN: Finds a tenant by its unique identifier.
   * 
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const result = this.systemDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
      .all();
    return result[0] || null;
  }

  /**
   * ES: Busca un inquilino por su subdominio.
   * EN: Finds a tenant by its subdomain.
   * 
   * @param {string} subdomain 
   * @returns {Promise<Object|null>}
   */
  async findBySubdomain(subdomain) {
    const result = this.systemDb
      .select()
      .from(tenants)
      .where(eq(tenants.subdomain, subdomain))
      .limit(1)
      .all();
    return result[0] || null;
  }

  /**
   * ES: Obtiene la lista completa de inquilinos en el sistema.
   * EN: Gets the complete list of tenants in the system.
   * 
   * @returns {Promise<Array<Object>>}
   */
  async findAll() {
    return this.systemDb
      .select()
      .from(tenants)
      .all();
  }

  /**
   * ES: Actualiza los datos de un inquilino existente.
   * EN: Updates an existing tenant's details.
   * 
   * @param {string} id
   * @param {Object} tenantData
   * @returns {Promise<Object>}
   */
  async update(id, tenantData) {
    const now = new Date().toISOString();
    const result = this.systemDb
      .update(tenants)
      .set({
        ...tenantData,
        updatedAt: now,
      })
      .where(eq(tenants.id, id))
      .returning()
      .all();
    return result[0];
  }
}