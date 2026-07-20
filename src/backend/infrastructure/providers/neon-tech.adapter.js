import pg from 'pg';
import { buildCreateTable, buildAlterStatements, escapeIdentifier as ident } from '../ddl/pg-ddl.builder.js';

/**
 * Store SQL del No-Code sobre **Neon/Postgres**. Aquí viven las tablas de **datos de negocio** del
 * tenant (no en SQLite; no-code.md). Conexión por pool. La data se crea/consulta vía el DDL
 * builder + queries parametrizadas. Ver .doc/tree/src/backend/infrastructure.md.
 *
 * @param {string} connectionString - URI de Postgres del tenant (Neon).
 * @returns {{
 *   ensureResource: (resource: object, allResources?: object[]) => Promise<void>,
 *   migrate: (physicalName: string, diff: object, allResources?: object[]) => Promise<void>,
 *   insert: (physicalName: string, row: object) => Promise<object>,
 *   findMany: (physicalName: string, opts?: { limit?: number, offset?: number, where?: object }) => Promise<object[]>,
 *   findById: (physicalName: string, id: string) => Promise<object|null>,
 *   update: (physicalName: string, id: string, patch: object) => Promise<object|null>,
 *   softDelete: (physicalName: string, id: string, now: number) => Promise<boolean>,
 *   query: (text: string, params?: any[]) => Promise<import('pg').QueryResult>,
 *   close: () => Promise<void>
 * }}
 */
export function createNeonStore(connectionString) {
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 5000 });

  return {
    /**
     * Crea (idempotente) la tabla física de una resource con sus campos de auditoría.
     *
     * @param {object} resource - Resource del contrato con `physicalName` y `fields`.
     * @param {object[]} [allResources=[]] - Lista completa de resources (para FK).
     */
    async ensureResource(resource, allResources = []) {
      await pool.query(buildCreateTable(resource, allResources));
    },

    /**
     * Aplica un diff de migración (add/rename/retype) dentro de una transacción.
     * Si algo falla (p.ej. retype con datos incompatibles), `ROLLBACK` total y la tabla queda intacta.
     *
     * @param {string} physicalName - Nombre físico de la tabla.
     * @param {{ adds: object[], renames: object[], retypes: object[], drops: object[] }} diff - Diff de campos.
     * @param {object[]} [allResources=[]] - Lista completa de resources (para FK).
     */
    async migrate(physicalName, diff, allResources = []) {
      const statements = buildAlterStatements(physicalName, diff, allResources);
      if (statements.length === 0) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const statement of statements) await client.query(statement);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    /**
     * Inserta una fila (claves = columnas, validadas/escapadas) y la devuelve.
     *
     * @param {string} physicalName - Nombre físico de la tabla.
     * @param {object} row - Mapa columna → valor a insertar.
     * @returns {Promise<object>} Fila insertada con todos sus campos.
     */
    async insert(physicalName, row) {
      const cols = Object.keys(row);
      const sql =
        `INSERT INTO ${ident(physicalName)} (${cols.map(ident).join(', ')}) ` +
        `VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
      const { rows } = await pool.query(sql, Object.values(row));
      return rows[0];
    },

    /**
     * Lista filas no borradas (más recientes primero), paginado y filtrado.
     *
     * @param {string} physicalName - Nombre físico de la tabla.
     * @param {object} [opts] - Opciones de consulta.
     * @param {number} [opts.limit=50] - Máximo de filas a retornar.
     * @param {number} [opts.offset=0] - Número de filas a saltar.
     * @param {object} [opts.where=null] - Filtros adicionales columna → valor (AND).
     * @returns {Promise<object[]>} Lista de filas.
     */
    async findMany(physicalName, { limit = 50, offset = 0, where = null } = {}) {
      let sql = `SELECT * FROM ${ident(physicalName)} WHERE "deleted_at" IS NULL`;
      const params = [];
      if (where) {
        for (const [col, val] of Object.entries(where)) {
          params.push(val);
          sql += ` AND ${ident(col)} = $${params.length}`;
        }
      }
      params.push(limit, offset);
      sql += ` ORDER BY "created_at" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
      const { rows } = await pool.query(sql, params);
      return rows;
    },

    /**
     * Obtiene una fila por su `id` (no borrada) o `null`.
     *
     * @param {string} physicalName - Nombre físico de la tabla.
     * @param {string} id - ID de la fila.
     * @returns {Promise<object|null>} Fila encontrada o `null`.
     */
    async findById(physicalName, id) {
      const { rows } = await pool.query(
        `SELECT * FROM ${ident(physicalName)} WHERE "id" = $1 AND "deleted_at" IS NULL`,
        [id],
      );
      return rows[0] ?? null;
    },

    /**
     * Actualiza columnas de una fila (no borrada) y la devuelve, o `null` si no existe.
     *
     * @param {string} physicalName - Nombre físico de la tabla.
     * @param {string} id - ID de la fila.
     * @param {object} patch - Mapa columna → nuevo valor.
     * @returns {Promise<object|null>} Fila actualizada o `null`.
     */
    async update(physicalName, id, patch) {
      const cols = Object.keys(patch);
      const sets = cols.map((c, i) => `${ident(c)} = $${i + 1}`);
      const sql =
        `UPDATE ${ident(physicalName)} SET ${sets.join(', ')} ` +
        `WHERE "id" = $${cols.length + 1} AND "deleted_at" IS NULL RETURNING *`;
      const { rows } = await pool.query(sql, [...Object.values(patch), id]);
      return rows[0] ?? null;
    },

    /**
     * Borrado lógico: marca `deleted_at` en la fila. Devuelve `true` si afectó una fila.
     *
     * @param {string} physicalName - Nombre físico de la tabla.
     * @param {string} id - ID de la fila.
     * @param {number} now - Timestamp epoch ms.
     * @returns {Promise<boolean>} `true` si se marcó como borrada.
     */
    async softDelete(physicalName, id, now) {
      const { rowCount } = await pool.query(
        `UPDATE ${ident(physicalName)} SET "deleted_at" = $1 WHERE "id" = $2 AND "deleted_at" IS NULL`,
        [now, id],
      );
      return rowCount > 0;
    },

    async softDeleteAll(physicalName, now) {
      await pool.query(
        `UPDATE ${ident(physicalName)} SET "deleted_at" = $1 WHERE "deleted_at" IS NULL`,
        [now],
      );
    },

    /**
     * Ejecuta una query parametrizada cruda en el pool de Neon/Postgres.
     *
     * @param {string} text - SQL con placeholders `$1, $2, ...`.
     * @param {any[]} [params] - Valores para los placeholders.
     * @returns {Promise<import('pg').QueryResult>} Resultado de la query.
     */
    query(text, params) {
      return pool.query(text, params);
    },

    /**
     * Cierra el pool de conexiones con Neon/Postgres.
     *
     * @returns {Promise<void>}
     */
    async close() {
      await pool.end();
    },
  };
}
