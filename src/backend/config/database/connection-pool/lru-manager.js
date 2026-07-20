/**
 * Pool LRU de conexiones SQLite por tenant.
 *
 * Gestiona un conjunto de conexiones a bases de datos SQLite, una por tenant,
 * manteniendo abiertas solo las más activas. Cuando se alcanza el límite
 * máximo, cierra la conexión menos recientemente usada. Cada conexión tiene
 * un TTL de inactividad tras el cual se cierra automáticamente.
 * Previene la saturación del límite de descriptores de archivo del SO.
 *
 * @module lru-manager
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { env } from '../../env.js';
import { migrateTenant } from '../../drizzle/migrator.js';


// Pool LRU de conexiones SQLite por tenant. Mantiene abiertos solo los descriptores
// de los tenants más activos; cierra ordenadamente los inactivos para no saturar
// el límite de descriptores de archivos del SO.
// Ver .doc/tree/src/backend/config.md (connection-pool/lru-manager.js).

const DEFAULT_MAX = 50;
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 min de inactividad

/**
 * Pool LRU de conexiones SQLite de tenants.
 *
 * Administra un mapa de conexiones abiertas con política de desalojo LRU:
 * cuando el pool alcanza su capacidad máxima, cierra la conexión menos
 * usada. Cada conexión tiene un temporizador de expulsión por inactividad.
 */
class LRUConnectionPool {
  /** @type {Map<string, { db: Database, lastUsed: number, timer: NodeJS.Timeout }>} */
  #cache = new Map();
  #max;
  #ttlMs;

  constructor({ max = DEFAULT_MAX, ttlMs = DEFAULT_TTL_MS } = {}) {
    this.#max = max;
    this.#ttlMs = ttlMs;
  }

  /**
   * Obtiene (o abre) la conexión SQLite de un tenant.
   *
   * Si la conexión ya existe en el pool, la mueve al final (MRU) y reinicia
   * su temporizador de expulsión. Si no existe, abre una nueva conexión,
   * ejecuta las migraciones pendientes y la registra en el pool.
   * @param {string} tenantId - Identificador único del tenant.
   * @returns {Database} Instancia de better-sqlite3.
   * @throws {Error} Si no se puede abrir la base de datos (ruta inválida, permisos, etc.).
   */
  get(tenantId) {
    const entry = this.#cache.get(tenantId);
    if (entry) {
      entry.lastUsed = Date.now();
      clearTimeout(entry.timer);
      entry.timer = this.#scheduleEviction(tenantId);
      // Mover al final (más recientemente usado) para mantener el orden LRU.
      this.#cache.delete(tenantId);
      this.#cache.set(tenantId, entry);
      return entry.db;
    }
    return this.#open(tenantId);
  }

  /**
   * Cierra la conexión de un tenant específico y la desaloja del pool.
   * @param {string} tenantId - Identificador único del tenant.
   * @returns {void}
   */
  close(tenantId) {
    const entry = this.#cache.get(tenantId);
    if (!entry) return;
    clearTimeout(entry.timer);
    try { entry.db.close(); } catch { /* ya cerrada */ }
    this.#cache.delete(tenantId);
  }

  /**
   * Cierra todas las conexiones activas del pool (shutdown ordenado).
   * @returns {void}
   */
  closeAll() {
    for (const [id] of this.#cache) {
      this.close(id);
    }
  }

  /**
   * Número de conexiones activas en el pool.
   * @returns {number}
   */
  get size() {
    return this.#cache.size;
  }

  // ── Internos ─────────────────────────────────────────────────────────

  #open(tenantId) {
    // Desalojar la más antigua si se alcanzó la capacidad máxima.
    if (this.#cache.size >= this.#max) {
      const oldest = this.#cache.keys().next().value;
      this.close(oldest);
    }

    // Asegurar que la base de datos física existe y tiene el esquema al día (migraciones).
    migrateTenant(tenantId);

    const dbPath = join(env.TENANTS_DB_DIR, `${tenantId}.db`);
    const db = new Database(dbPath);

    // PRAGMAs idénticos a sqlite-platform.js. Ver .doc/rules/databases.md.
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');

    const entry = {
      db,
      lastUsed: Date.now(),
      timer: this.#scheduleEviction(tenantId),
    };
    this.#cache.set(tenantId, entry);
    return db;
  }

  #scheduleEviction(tenantId) {
    return setTimeout(() => this.close(tenantId), this.#ttlMs);
  }
}

/** Pool singleton de conexiones SQLite de tenants. */
export const tenantPool = new LRUConnectionPool();
