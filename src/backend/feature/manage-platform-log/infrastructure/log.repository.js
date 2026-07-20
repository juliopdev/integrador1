import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { platformLogsLocal } from '../../../config/drizzle/schema-platform.js';
import { uuidv7 } from '../../../common/id.js';

/**
 * Fábrica para el repositorio de logs de plataforma. Lectura paginada con cursor por `createdAt`
 * (más nuevos primero) + filtro opcional por `level`. La escritura vive en el `dev-logger.hook` /
 * pino transport — este repo es sólo lectura para el dashboard del Superadmin.
 *
 * Slice A: paginación por offset simple. Cuando volumetría lo exija se cambia a cursor por
 * `(createdAt, id)` sin quebrar la API pública del use case.
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.db - Instancia de Drizzle conectada a `platform.db`.
 * @returns {{
 *   insert: (params: { level: string, message: string, metadata?: object|null, createdAt?: number }) => object,
 *   list: (params?: { level?: string|null, before?: number|null, limit?: number }) => Array<object>,
 *   counts: () => { total: number, info: number, warn: number, error: number },
 *   deleteOlderThan: (beforeMs: number) => number,
 * }}
 */
export function createLogRepository({ db }) {
  return {
    /**
     * Persiste una entrada de log. El id se genera acá para que el hook (llamador) no lo tenga
     * que resolver — el recorder emite la fila completa al bus. `metadata` opcional se serializa
     * a JSON string (schema del campo).
     * @param {Object} params - Datos del log.
     * @param {string} params.level - Nivel de severidad (`info`, `warn`, `error`).
     * @param {string} params.message - Mensaje del log.
     * @param {object|null} [params.metadata=null] - Metadatos adicionales (se serializan a JSON).
     * @param {number} [params.createdAt] - Timestamp de creación (ms).
     * @returns {object} Fila insertada completa (con id y createdAt).
     */
    insert({ level, message, metadata = null, createdAt = Date.now() }) {
      const id = `log_${uuidv7()}`;
      const row = {
        id,
        level,
        message,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
        createdAt,
      };
      db.insert(platformLogsLocal).values(row).run();
      return row;
    },

    /**
     * Lista los últimos logs. `level` opcional filtra por severidad; `before` es un cursor
     * de `createdAt` para "cargar más" sin colisionar con nuevos logs.
     * @param {Object} [params] - Parámetros de consulta.
     * @param {string|null} [params.level=null] - Nivel de severidad (`info`|`warn`|`error`).
     * @param {number|null} [params.before=null] - Cursor de timestamp (ms) para paginación.
     * @param {number} [params.limit=50] - Cantidad máxima de registros.
     * @returns {Array<{ id: string, level: string, message: string, metadataJson: string|null, createdAt: number }>}
     */
    list({ level = null, before = null, limit = 50 } = {}) {
      const filters = [];
      if (level) filters.push(eq(platformLogsLocal.level, level));
      if (before) filters.push(lt(platformLogsLocal.createdAt, before));
      const where = filters.length > 0 ? and(...filters) : undefined;

      let q = db.select({
        id: platformLogsLocal.id,
        level: platformLogsLocal.level,
        message: platformLogsLocal.message,
        metadataJson: platformLogsLocal.metadataJson,
        createdAt: platformLogsLocal.createdAt,
      }).from(platformLogsLocal);
      if (where) q = q.where(where);
      return q.orderBy(desc(platformLogsLocal.createdAt)).limit(limit).all();
    },

    /**
     * Retorna el conteo total de logs desglosado por nivel.
     * @returns {{ total: number, info: number, warn: number, error: number }}
     */
    counts() {
      const oneRow = (q) => q.all()[0]?.n ?? 0;
      return {
        total: oneRow(db.select({ n: sql`count(*)` }).from(platformLogsLocal)),
        info: oneRow(db.select({ n: sql`count(*)` }).from(platformLogsLocal).where(eq(platformLogsLocal.level, 'info'))),
        warn: oneRow(db.select({ n: sql`count(*)` }).from(platformLogsLocal).where(eq(platformLogsLocal.level, 'warn'))),
        error: oneRow(db.select({ n: sql`count(*)` }).from(platformLogsLocal).where(eq(platformLogsLocal.level, 'error'))),
      };
    },

    /**
     * Elimina logs anteriores a `beforeMs`. Base del job `logs.archive`.
     * @param {number} beforeMs - Timestamp límite (ms); los logs con `createdAt` anterior se eliminan.
     * @returns {number} Cantidad de filas eliminadas.
     */
    deleteOlderThan(beforeMs) {
      const res = db.delete(platformLogsLocal).where(lt(platformLogsLocal.createdAt, beforeMs)).run();
      return res.changes;
    },
  };
}
