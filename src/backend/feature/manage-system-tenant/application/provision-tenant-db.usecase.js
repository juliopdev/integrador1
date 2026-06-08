import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { migrateTenantDb } from '../../../config/drizzle/migrator.js';

/**
 * ES: Caso de Uso para aprovisionar físicamente la base de datos de un nuevo inquilino.
 * Crea el archivo SQLite autónomo correspondiente en el disco y ejecuta el migrador DDL inicial.
 * 
 * EN: Use Case to physically provision the database of a new tenant.
 * Creates the corresponding autonomous SQLite file on disk and runs the initial DDL migrator.
 */
export class ProvisionTenantDbUseCase {
  /**
   * @param {Object} cradle
   * @param {Object} cradle.env
   */
  constructor({ env }) {
    this.env = env;
  }

  /**
   * ES: Ejecuta el aprovisionamiento de la base de datos física del inquilino.
   * EN: Executes the physical tenant database provisioning.
   * 
   * @param {string} tenantId 
   * @param {Object} [blueprintSchema] - ES: Esquema JSON de tablas del backend. EN: JSON schema of backend tables.
   * @returns {Promise<void>}
   */
  async execute(tenantId, blueprintSchema = null) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for provisioning / El ID de inquilino es obligatorio');
    }

    const tenantsDir = path.resolve(process.cwd(), this.env.TENANTS_DB_DIR);
    if (!fs.existsSync(tenantsDir)) {
      fs.mkdirSync(tenantsDir, { recursive: true });
    }

    const dbPath = path.join(tenantsDir, `${tenantId}.db`);

    // ES: Conectar al archivo SQLite temporalmente para inicializar sus tablas.
    // EN: Connect to the SQLite file temporarily to initialize its tables.
    const sqliteConn = new Database(dbPath);
    sqliteConn.pragma('journal_mode = WAL');

    try {
      migrateTenantDb(sqliteConn);

      // ES: Si se proporciona un plano de backend no-code, compilar y ejecutar su DDL dinámico.
      // EN: If a no-code backend blueprint is provided, compile and run its dynamic DDL.
      if (blueprintSchema && Array.isArray(blueprintSchema.tables)) {
        for (const table of blueprintSchema.tables) {
          const columnsDdl = table.columns.map(col => {
            let definition = `${col.name} ${col.type.toUpperCase()}`;
            
            // ES: Tratar 'id' especial como INTEGER PRIMARY KEY AUTOINCREMENT.
            // EN: Treat 'id' specially as INTEGER PRIMARY KEY AUTOINCREMENT.
            if (col.name.toLowerCase() === 'id' && col.type.toLowerCase() === 'integer') {
              return `${col.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
            }

            if (!col.nullable) {
              definition += ' NOT NULL';
            }
            if (col.unique) {
              definition += ' UNIQUE';
            }
            if (col.defaultValue !== undefined && col.defaultValue !== null) {
              if (col.defaultValue === 'CURRENT_TIMESTAMP') {
                definition += ' DEFAULT CURRENT_TIMESTAMP';
              } else if (typeof col.defaultValue === 'string') {
                definition += ` DEFAULT '${col.defaultValue}'`;
              } else {
                definition += ` DEFAULT ${col.defaultValue}`;
              }
            }
            return definition;
          }).join(', ');

          const createTableDdl = `CREATE TABLE IF NOT EXISTS ${table.name} (${columnsDdl});`;
          sqliteConn.exec(createTableDdl);
        }
      }
    } catch (err) {
      console.error(`❌ Provisioning database for tenant ${tenantId} failed / Falló el aprovisionamiento:`, err);
      throw err;
    } finally {
      sqliteConn.close();
    }
  }
}
