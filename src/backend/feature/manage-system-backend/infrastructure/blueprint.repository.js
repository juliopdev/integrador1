import { BlueprintRepositoryContract } from '../../../domain/contracts/blueprint-repository.contract.js';
import { backendBlueprints } from '../../../config/drizzle/schema.js';
import { eq, isNull, and } from 'drizzle-orm';

/**
 * ES: Repositorio de Infraestructura para gestionar planos de backend (Blueprints).
 * Escribe el estado del plano de manera relacional en SQLite (system.db) usando Drizzle,
 * y en paralelo registra un log de auditoría inmutable en MongoDB Atlas.
 * 
 * EN: Infrastructure Repository to manage backend blueprints.
 * Writes blueprint state relationally in SQLite (system.db) using Drizzle,
 * and concurrently logs an immutable audit trace in MongoDB Atlas.
 */
export class BlueprintRepository extends BlueprintRepositoryContract {
  /**
   * @param {Object} cradle
   * @param {import('drizzle-orm/better-sqlite3').BetterSQLite3Database} cradle.systemDb
   * @param {import('../../../infrastructure/providers/mongodb-atlas.adapter').MongoAtlasAdapter} cradle.mongoAtlasAdapter
   */
  constructor({ systemDb, mongoAtlasAdapter }) {
    super();
    this.systemDb = systemDb;
    this.mongoAtlasAdapter = mongoAtlasAdapter;
  }

  /**
   * ES: Crea un nuevo plano y registra auditoría.
   * EN: Creates a new blueprint and records audit.
   * 
   * @param {Object} blueprintData 
   * @returns {Promise<Object>}
   */
  async create(blueprintData) {
    const now = new Date().toISOString();
    const result = this.systemDb
      .insert(backendBlueprints)
      .values({
        ...blueprintData,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    const blueprint = result[0];

    // ES: Registro de auditoría asíncrono sin bloquear la respuesta de la base de datos principal.
    // EN: Asynchronous audit logging without blocking the main database response.
    this.mongoAtlasAdapter.logChange({
      action: 'CREATE',
      blueprintId: blueprint.id,
      details: blueprint,
    }).catch(err => console.error('⚠️ Mongo Atlas audit logging failed / Falló auditoría de Mongo:', err));

    return blueprint;
  }

  /**
   * ES: Actualiza un plano existente y registra auditoría.
   * EN: Updates an existing blueprint and records audit.
   * 
   * @param {string} id 
   * @param {Object} blueprintData 
   * @returns {Promise<Object>}
   */
  async update(id, blueprintData) {
    const now = new Date().toISOString();
    const result = this.systemDb
      .update(backendBlueprints)
      .set({
        ...blueprintData,
        updatedAt: now,
      })
      .where(eq(backendBlueprints.id, id))
      .returning()
      .all();
    const blueprint = result[0];

    this.mongoAtlasAdapter.logChange({
      action: 'UPDATE',
      blueprintId: id,
      details: blueprint,
    }).catch(err => console.error('⚠️ Mongo Atlas audit logging failed / Falló auditoría de Mongo:', err));

    return blueprint;
  }

  /**
   * ES: Realiza un borrado lógico de un plano y registra auditoría.
   * EN: Performs a logical delete of a blueprint and records audit.
   * 
   * @param {string} id 
   * @returns {Promise<Object>}
   */
  async delete(id) {
    const now = new Date().toISOString();
    const result = this.systemDb
      .update(backendBlueprints)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(backendBlueprints.id, id))
      .returning()
      .all();
    const blueprint = result[0];

    this.mongoAtlasAdapter.logChange({
      action: 'DELETE',
      blueprintId: id,
      details: { deletedAt: now },
    }).catch(err => console.error('⚠️ Mongo Atlas audit logging failed / Falló auditoría de Mongo:', err));

    return blueprint;
  }

  /**
   * ES: Busca un plano activo por ID.
   * EN: Finds an active blueprint by ID.
   * 
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const result = this.systemDb
      .select()
      .from(backendBlueprints)
      .where(and(eq(backendBlueprints.id, id), isNull(backendBlueprints.deletedAt)))
      .limit(1)
      .all();
    return result[0] || null;
  }

  /**
   * ES: Obtiene todos los planos no borrados.
   * EN: Gets all non-deleted blueprints.
   * 
   * @returns {Promise<Array<Object>>}
   */
  async findAllActive() {
    return this.systemDb
      .select()
      .from(backendBlueprints)
      .where(isNull(backendBlueprints.deletedAt))
      .all();
  }
}