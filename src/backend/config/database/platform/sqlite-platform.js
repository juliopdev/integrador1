/**
 * Conexión a la base de datos SQLite de plataforma.
 *
 * Inicializa la conexión a platform.db (o a una base en memoria durante
 * tests) con better-sqlite3 y expone tanto la instancia cruda de
 * better-sqlite3 como el objeto Drizzle. Configura los PRAGMAs obligatorios
 * de concurrencia: WAL, busy_timeout, foreign_keys y synchronous.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { env } from '../../env.js';

// PRAGMAs de concurrencia (WAL, busy_timeout, FK, synchronous): ver .doc/rules/databases.md.
// En test se usa una BD en memoria para aislar las pruebas (ver .doc/rules/tests.md).
const dbPath = env.NODE_ENV === 'test' ? ':memory:' : env.PLATFORM_DB_PATH;
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');

/** Instancia cruda de better-sqlite3 (para DDL/PRAGMAs/queries directas). */
export const platformSqlite = sqlite;

/** Instancia Drizzle sobre `platform.db`. */
export const platformDb = drizzle(sqlite);
