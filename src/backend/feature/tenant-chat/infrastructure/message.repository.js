import { sql } from 'drizzle-orm';

/**
 * Repositorio de mensajes de chat de soporte. Almacena en la tabla SQLite local
 * `support_messages` del tenant (fallback cuando no hay MongoDB). Crea la tabla
 * automáticamente si no existe.
 *
 * @param {Object} deps
 * @param {Object} deps.db - Drizzle handle sobre tenant.db.
 * @param {string} deps.tenantId - ID del tenant (usado para log).
 * @param {import('pino').Logger} deps.logger - Logger.
 * @returns {{
 *   saveMessage: (params: { id: string, sender: Object, text: string, channel: string, createdAt: string }) => Promise<Object>,
 *   getMessagesByChannel: (channel: string, limit?: number, offset?: number) => Promise<Array<Object>>,
 * }}
 */
export function createMessageRepository({ db, tenantId, logger }) {
  // Inicialización defensiva: crear la tabla support_messages en la SQLite local del tenant
  // si es que se usa fallback (para no romper la UI si no hay Mongo).
  try {
    db.run(sql`
      CREATE TABLE IF NOT EXISTS support_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        sender_scope TEXT NOT NULL,
        text TEXT NOT NULL,
        channel TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  } catch (err) {
    logger.error({ err }, '[chat] error al inicializar tabla local de mensajes');
  }

  return {
    /**
     * Persiste un mensaje en support_messages (fallback SQLite local).
     * @param {Object} params
     * @param {string} params.id - UUIDv7.
     * @param {Object} params.sender - { id, email, scope }.
     * @param {string} params.text - Contenido del mensaje.
     * @param {string} params.channel - Canal de chat.
     * @param {string} params.createdAt - Timestamp de creación.
     * @returns {Promise<Object>}
     */
    async saveMessage({ id, sender, text, channel, createdAt }) {
      // Fallback SQLite local
      db.run(
        sql`INSERT INTO support_messages (id, sender_id, sender_email, sender_scope, text, channel, created_at)
            VALUES (${id}, ${sender.id}, ${sender.email}, ${sender.scope}, ${text}, ${channel}, ${createdAt})`
      );
      return { id, sender, text, channel, createdAt };
    },

    /**
     * Recupera mensajes de un canal específico, ordenados por creación ASC.
     * @param {string} channel - Identificador del canal.
     * @param {number} [limit=50] - Máx. mensajes a retornar.
     * @param {number} [offset=0] - Desplazamiento.
     * @returns {Promise<Array<{ id: string, sender: { id: string, email: string, scope: string }, text: string, channel: string, createdAt: string }>>}
     */
    async getMessagesByChannel(channel, limit = 50, offset = 0) {
      const rows = db.select({
        id: sql`id`,
        sender_id: sql`sender_id`,
        sender_email: sql`sender_email`,
        sender_scope: sql`sender_scope`,
        text: sql`text`,
        channel: sql`channel`,
        created_at: sql`created_at`
      })
      .from(sql`support_messages`)
      .where(sql`channel = ${channel}`)
      .orderBy(sql`created_at ASC`)
      .limit(limit)
      .offset(offset)
      .all();

      return rows.map((r) => ({
        id: r.id,
        sender: {
          id: r.sender_id,
          email: r.sender_email,
          scope: r.sender_scope,
        },
        text: r.text,
        channel: r.channel,
        createdAt: r.created_at,
      }));
    }
  };
}
