const DEFAULT_GRACE_DAYS = 30;

/**
 * Fábrica para el handler del job `tenant.purge`. Ejecuta el hard-delete (GDPR) sobre un tenant
 * soft-deleted cuya `deletedAt` es anterior al cutoff. Orden estricto (`deletion.md §4`):
 *
 * 1. Recursos externos por-tenant (Neon/Mongo/Cloudinary/Caddy/Drive) — **stubbed en Slice A**.
 * 2. Archivo `data/tenants/<tenantId>.db` (PII del tenant → GDPR).
 * 3. Hard-delete de `platform.db.tenants` (cascada real sobre memberships, api_keys, etc.).
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.purgeRepository - Repositorio de purgas de plataforma.
 * @param {string} deps.tenantsDbDir - Directorio donde residen los archivos `.db` de los tenants.
 * @param {Object} deps.fsAdapter - Adaptador del sistema de archivos (eliminación de archivos).
 * @param {Array<{ name: string, run: (tenantId: string) => Promise<void> }>} [deps.externalCleanups=[]]
 *   - Adaptadores de limpieza externa (Neon, Mongo, etc.).
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(payload?: { tenantId?: string, graceDays?: number }) =>
 *   Promise<{ cutoff: number, graceDays: number, purged: Array<{ tenantId: string, subdomain?: string, externalErrors: Array, dbFileDeleted?: boolean, platformRowsDeleted?: number }> }>}
 */
export function makeTenantPurgeJob({ purgeRepository, tenantsDbDir, fsAdapter, externalCleanups = [], now = () => Date.now() }) {
  /**
   * Ejecuta la purga de tenants soft-deleted que hayan superado el período de gracia.
   * @param {Object} [payload] - Payload opcional del job.
   * @param {string} [payload.tenantId] - Si se especifica, purga solo ese tenant.
   * @param {number} [payload.graceDays] - Días de gracia antes de purgar (default: 30).
   * @returns {Promise<{ cutoff: number, graceDays: number, purged: Array<{ tenantId: string, subdomain?: string, externalErrors: Array, dbFileDeleted?: boolean, dbFileError?: string, platformRowsDeleted?: number }> }>}
   */
  return async function tenantPurgeJob(payload) {
    const graceDays = Number.isFinite(Number(payload?.graceDays)) && Number(payload.graceDays) >= 0
      ? Number(payload.graceDays) : DEFAULT_GRACE_DAYS;
    const cutoff = now() - graceDays * 86400_000;

    let candidates;
    if (payload?.tenantId) {
      candidates = [{ id: payload.tenantId }];
    } else {
      candidates = purgeRepository.listExpiredSoftDeleted(cutoff);
    }

    const results = [];
    for (const t of candidates) {
      const step = { tenantId: t.id, subdomain: t.subdomain, externalErrors: [] };

      // 1. Adapters externos (stub-first: si no hay adapters cableados, no-op).
      for (const adapter of externalCleanups) {
        try {
          await adapter.run(t.id);
        } catch (err) {
          step.externalErrors.push({ adapter: adapter.name, error: err?.message ?? String(err) });
        }
      }

      // 2. `.db` del tenant.
      try {
        fsAdapter.removeFile(fsAdapter.join(tenantsDbDir, `${t.id}.db`));
        step.dbFileDeleted = true;
      } catch (err) {
        step.dbFileDeleted = false;
        step.dbFileError = err?.code ?? String(err); // ENOENT es benigno si ya no existe
      }

      // 3. Hard-delete en platform.db (cascada → memberships, deploys, etc.).
      const affected = purgeRepository.hardDeleteTenant(t.id);
      step.platformRowsDeleted = affected;

      results.push(step);
    }

    return { cutoff, graceDays, purged: results };
  };
}
