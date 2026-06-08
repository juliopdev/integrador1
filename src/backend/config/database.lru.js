import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { tenantSchema } from './drizzle/schema.js';
import path from 'path';
import fs from 'fs';
import { env } from './env.js';

/**
 * ES: Pool de Conexiones SQLite Dinámico gestionado por un algoritmo LRU (Least Recently Used).
 * Ayuda a limitar el número de conexiones físicas de base de datos simultáneas en memoria RAM,
 * cerrando de forma proactiva aquellas conexiones de inquilinos que no hayan sido consultadas recientemente.
 * 
 * EN: Dynamic SQLite Connection Pool managed by an LRU (Least Recently Used) algorithm.
 * Helps limit the number of simultaneous physical database connections in RAM by proactively
 * closing tenant connections that have not been queried recently.
 */
export class TenantConnectionPool {
  /**
   * @param {number} maxSize - ES: Cantidad máxima de conexiones a mantener abiertas. EN: Maximum active connections to keep open.
   */
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.cache = new Map(); // ES: Mapa de conexiones activas. EN: Active connections map.
  }

  /**
   * ES: Obtiene una conexión Drizzle activa para el inquilino solicitado. Si no existe en la caché,
   * se abre una nueva conexión física y se añade al pool. Si se supera el límite de capacidad,
   * se cierra la conexión de inquilino menos utilizada.
   * 
   * EN: Resolves an active Drizzle connection for the requested tenant. If it does not exist in cache,
   * a new physical connection is opened and added to the pool. If capacity is exceeded,
   * the least recently used tenant connection is closed.
   * 
   * @param {string} tenantId - ES: Identificador único del inquilino. EN: Tenant unique identifier.
   * @returns {import('drizzle-orm/better-sqlite3').BetterSQLite3Database<typeof tenantSchema>}
   */
  getConnection(tenantId) {
    // ES: Si ya existe la conexión, actualiza su marca de uso y la retorna.
    // EN: If connection exists, update its lastUsed timestamp and return it.
    if (this.cache.has(tenantId)) {
      const conn = this.cache.get(tenantId);
      conn.lastUsed = Date.now();
      return conn.drizzleInstance;
    }

    // ES: Asegurar que el directorio de almacenamiento de inquilinos exista físicamente.
    // EN: Ensure the tenants database storage directory physically exists.
    const tenantsDir = path.resolve(process.cwd(), env.TENANTS_DB_DIR);
    if (!fs.existsSync(tenantsDir)) {
      fs.mkdirSync(tenantsDir, { recursive: true });
    }

    const dbPath = path.join(tenantsDir, `${tenantId}.db`);

    // ES: Si el pool alcanzó su límite, liberar la conexión inactiva más antigua.
    // EN: If pool has reached capacity, evict the oldest inactive connection.
    if (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // ES: Abre la base de datos de SQLite y activa el modo de escritura adelantada (WAL) para mayor rendimiento.
    // EN: Opens the SQLite database and enables Write-Ahead Logging (WAL) mode for better performance.
    const sqliteConn = new Database(dbPath);
    sqliteConn.pragma('journal_mode = WAL');

    const drizzleInstance = drizzle(sqliteConn, { schema: tenantSchema });

    // ES: Guardar la nueva conexión en caché.
    // EN: Store new connection in cache.
    this.cache.set(tenantId, {
      sqliteConn,
      drizzleInstance,
      lastUsed: Date.now()
    });

    console.log(`[LRU Pool] Opened database connection for tenant / Conexión abierta para inquilino: ${tenantId}`);

    return drizzleInstance;
  }

  /**
   * ES: Algoritmo LRU para identificar, cerrar y remover de memoria la conexión de inquilino menos utilizada.
   * EN: LRU algorithm to identify, close, and remove from memory the least recently used tenant connection.
   */
  evictLeastRecentlyUsed() {
    let oldestKey = null;
    let oldestTime = Infinity;

    // ES: Buscar la marca temporal de uso más antigua en el mapa de caché.
    // EN: Locate the oldest usage timestamp within the cache map.
    for (const [key, value] of this.cache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const { sqliteConn } = this.cache.get(oldestKey);
      try {
        // ES: Cierra físicamente el descriptor del archivo SQLite.
        // EN: Physically close the SQLite file descriptor.
        sqliteConn.close();
        console.log(`[LRU Pool] Closed database connection for tenant: ${oldestKey} (Eviction due to pool capacity)`);
      } catch (err) {
        console.error(`[LRU Pool] Error closing connection for tenant ${oldestKey}:`, err);
      }
      this.cache.delete(oldestKey);
    }
  }

  /**
   * ES: Cierra limpiamente todas las conexiones abiertas actualmente en el pool.
   * EN: Gracefully closes all open connections currently registered in the pool.
   */
  closeAll() {
    for (const [key, value] of this.cache.entries()) {
      try {
        value.sqliteConn.close();
      } catch (err) {
        console.error(`[LRU Pool] Error closing connection for tenant ${key}:`, err);
      }
    }
    this.cache.clear();
  }
}
