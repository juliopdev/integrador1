/**
 * Fábrica para el handler del job `logs.archive`. Purga los logs de `platform_logs_local` anteriores
 * a `retentionDays` (default: 30). En Slice A **no archiva a Mongo Atlas** — sólo purga localmente
 * para que la tabla no crezca sin límite. Slice B agregará el escritor a Mongo (`logs_cold`).
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.logRepository - Repositorio de logs que expone `deleteOlderThan(ms)`.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(payload?: { retentionDays?: number }) => Promise<{ retentionDays: number, cutoff: number, deleted: number }>}
 */
export function makeLogsArchiveJob({ logRepository, now = () => Date.now() }) {
  /**
   * Ejecuta la purga de logs antiguos según los días de retención indicados.
   * @param {Object} [payload] - Payload opcional del job.
   * @param {number} [payload.retentionDays] - Días de retención (default: 30).
   * @returns {Promise<{ retentionDays: number, cutoff: number, deleted: number }>}
   *   Información de la purga: días aplicados, timestamp de corte y cantidad de registros eliminados.
   */
  return async function logsArchiveJob(payload) {
    const retentionDays = Number(payload?.retentionDays);
    const days = Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 30;
    const cutoff = now() - days * 86400_000;
    const deleted = logRepository.deleteOlderThan(cutoff);
    return { retentionDays: days, cutoff, deleted };
  };
}
