/**
 * Ejecutor de migraciones Drizzle para platform.db y bases de tenant.
 *
 * Contiene las funciones que aplican las migraciones de esquema tanto para
 * la base de datos de plataforma como para cada base de tenant individual.
 * Para tenants, crea el archivo físico si no existe, aplica la migración
 * base y devuelve la ruta del archivo creado.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { platformDb } from '../database/platform/sqlite-platform.js';
import { env } from '../env.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Aplica las migraciones de \`platform.db\`.
 * Idempotente — Drizzle lleva un registro interno de las migraciones ya aplicadas.
 * @returns {void}
 */
export function migratePlatform() {
  migrate(platformDb, { migrationsFolder: join(here, 'migrations', 'platform') });
}

/**
 * Crea (si no existe) la base SQLite de un tenant en `TENANTS_DB_DIR/<tenantId>.db` y aplica
 * la migración base de tenants. Abre y cierra una conexión propia (no pasa por el pool LRU).
 * Idempotente. Devuelve la ruta del archivo. Ver bootstrap.md y manage-platform-tenant.md.
 * @param {string} tenantId - Identificador único del tenant.
 * @returns {string} Ruta absoluta del archivo SQLite creado o migrado.
 */
export function migrateTenant(tenantId) {
  mkdirSync(env.TENANTS_DB_DIR, { recursive: true });
  const dbPath = join(env.TENANTS_DB_DIR, `${tenantId}.db`);
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  migrate(drizzle(sqlite), { migrationsFolder: join(here, 'migrations', 'tenants') });
  sqlite.close();
  return dbPath;
}
