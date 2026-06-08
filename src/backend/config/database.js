import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { systemSchema } from './drizzle/schema.js';
import { TenantConnectionPool } from './database.lru.js';
import { env } from './env.js';
import path from 'path';
import fs from 'fs';

// ES: Asegurar que el directorio contenedor de la base de datos global del sistema exista físicamente.
// EN: Ensure the container directory for the global system database physically exists.
const systemDbPath = path.resolve(process.cwd(), env.SYSTEM_DB_PATH);
const dbDir = path.dirname(systemDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

/**
 * ES: Conexión física a la base de datos global del sistema (`system.db`).
 * Se habilita el modo WAL (Write-Ahead Logging) para soportar múltiples operaciones concurrentes de lectura/escritura.
 * 
 * EN: Physical connection to the global system database (`system.db`).
 * WAL (Write-Ahead Logging) mode is enabled to support multiple concurrent read/write operations.
 * 
 * @type {import('better-sqlite3').Database}
 */
export const systemDbConnection = new Database(systemDbPath);
systemDbConnection.pragma('journal_mode = WAL');

/**
 * ES: Instancia ORM de Drizzle asociada a la base de datos del sistema global.
 * Utilizada para administrar inquilinos, esquemas técnicos no-code y plantillas globales de la plataforma.
 * 
 * EN: Drizzle ORM instance associated with the global system database.
 * Used to manage tenants, no-code technical schemas, and global platform layouts.
 * 
 * @type {import('drizzle-orm/better-sqlite3').BetterSQLite3Database<typeof systemSchema>}
 */
export const systemDb = drizzle(systemDbConnection, { schema: systemSchema });

/**
 * ES: Instancia global del Pool LRU de conexiones de base de datos para inquilinos.
 * Limita el consumo en RAM manteniendo un máximo de 10 conexiones activas simultáneas.
 * 
 * EN: Global instance of the Tenant LRU connection pool.
 * Limits RAM usage by maintaining a maximum of 10 simultaneous active connections.
 * 
 * @type {TenantConnectionPool}
 */
export const tenantPool = new TenantConnectionPool(10);

/**
 * ES: Resuelve la instancia ORM de Drizzle correspondiente al inquilino solicitado a través del pool LRU.
 * EN: Resolves the Drizzle ORM instance corresponding to the requested tenant via the LRU pool.
 * 
 * @param {string} tenantId - ES: Identificador del inquilino. EN: Tenant identifier.
 * @returns {import('drizzle-orm/better-sqlite3').BetterSQLite3Database}
 */
export const getTenantDb = (tenantId) => {
  return tenantPool.getConnection(tenantId);
};
