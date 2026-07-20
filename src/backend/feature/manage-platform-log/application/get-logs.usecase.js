const ALLOWED_LEVELS = new Set(['info', 'warn', 'error']);

/**
 * Fábrica para el caso de uso que lista logs de plataforma con filtro opcional por nivel
 * y paginación por cursor `before` (más recientes primero).
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.logRepository - Repositorio de logs de plataforma.
 * @returns {(params?: { level?: string|null, before?: string|number|null, limit?: number }) =>
 *   Promise<{ logs: Array<{ id: string, level: string, message: string, createdAt: number, metadata: object|null }>, counts: { total: number, info: number, warn: number, error: number } }>}
 */
export function makeGetLogs({ logRepository }) {
  /**
   * Obtiene la lista de logs aplicando los filtros de nivel y cursor.
   * @param {Object} [params] - Parámetros de consulta.
   * @param {string} [params.level=null] - Nivel de severidad (`info`, `warn`, `error`).
   * @param {string|number} [params.before=null] - Cursor `createdAt` para paginación hacia atrás.
   * @param {number} [params.limit=50] - Máximo de registros (1–200).
   * @returns {Promise<{ logs: Array<{ id: string, level: string, message: string, createdAt: number, metadata: object|null }>, counts: { total: number, info: number, warn: number, error: number } }>}
   */
  return async function getLogs({ level = null, before = null, limit = 50 } = {}) {
    const safeLevel = ALLOWED_LEVELS.has(level) ? level : null;
    const safeLimit = clamp(parseInt(limit, 10) || 50, 1, 200);
    const safeBefore = before != null && Number.isFinite(Number(before)) ? Number(before) : null;
    const rows = logRepository.list({ level: safeLevel, before: safeBefore, limit: safeLimit });
    return {
      logs: rows.map((r) => ({
        id: r.id, level: r.level, message: r.message, createdAt: r.createdAt,
        metadata: safeParseJson(r.metadataJson),
      })),
      counts: logRepository.counts(),
    };
  };
}

/**
 * Limita un valor numérico entre un mínimo y un máximo.
 * @param {number} v - Valor a acotar.
 * @param {number} min - Límite inferior.
 * @param {number} max - Límite superior.
 * @returns {number} Valor acotado.
 */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/**
 * Parsea una cadena JSON de forma segura. Si el input es nulo/vacío o el parseo falla,
 * retorna `null` sin lanzar excepción.
 * @param {string|null} s - Cadena JSON a parsear.
 * @returns {object|null} Objeto parseado o `null`.
 * @example
 * safeParseJson('{"key":1}') // { key: 1 }
 * safeParseJson(null)        // null
 */
function safeParseJson(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
