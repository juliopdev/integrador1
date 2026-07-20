/**
 * Handler del job `backup.generate`. Genera un snapshot consistente de `platform.db` y de todos
 * los `tenant.db` a un directorio timestamped: `backups/YYYY-MM-DDTHH-MM-SS/`.
 *
 * Usa la API `.backup(path)` de better-sqlite3 (WAL-aware, no bloquea escrituras). Es
 * **idempotente** dentro del mismo timestamp — si el archivo destino existe lo sobrescribe.
 *
 * `payload`: `{ retentionDays?: number }` — opcional, elimina backups más antiguos que N días.
 *
 * @param {{
 *   platformDbHandle: object,                       // better-sqlite3 handle de platform.db (para .backup)
 *   tenantsDbDir: string,                           // env.TENANTS_DB_DIR
 *   backupsDir: string,                             // ruta absoluta al dir de backups
 *   openTenantDb: (tenantId: string) => object,     // abre `.db` para llamar `.backup(path)`
 *   listTenantIds: () => string[],                  // ids de tenants activos (o todos)
 *   fsAdapter: object,
 *   now?: () => number,
 * }} deps
 * @returns {(_payload?: { retentionDays?: number }) => Promise<{timestamp: string, dir: string, platformDb: Object|null, tenants: Object[], pruned?: Object[]}>} Función del job.
 */
export function makeBackupGenerateJob({ platformDbHandle, tenantsDbDir, backupsDir, openTenantDb, listTenantIds, fsAdapter, now = () => Date.now() }) {
  /**
   * Genera un snapshot consistente de platform.db y de todos los tenant.db.
   * @param {Object} [_payload] - Payload del job.
   * @param {number} [_payload.retentionDays] - Días de retención (opcional, purga backups antiguos).
   * @returns {Promise<{timestamp: string, dir: string, platformDb: Object|null, tenants: Object[], pruned?: Object[]}>}
   */
  return async function backupGenerateJob(_payload) {
    const ts = new Date(now()).toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const dir = fsAdapter.join(backupsDir, ts);
    fsAdapter.ensureDir(dir);

    const results = { timestamp: ts, dir, platformDb: null, tenants: [] };

    // 1. Snapshot de platform.db.
    const platformOut = fsAdapter.join(dir, 'platform.db');
    await platformDbHandle.backup(platformOut);
    results.platformDb = { out: platformOut, bytes: fsAdapter.fileSize(platformOut) };

    // 2. Snapshot de cada tenant.db.
    for (const tenantId of listTenantIds()) {
      const out = fsAdapter.join(dir, `${tenantId}.db`);
      try {
        const db = openTenantDb(tenantId);
        await db.backup(out);
        results.tenants.push({ tenantId, out, bytes: fsAdapter.fileSize(out) });
      } catch (err) {
        results.tenants.push({ tenantId, error: err?.message ?? String(err) });
      }
    }

    // 3. Retención opcional (`_payload.retentionDays`) — borrado recursivo de dirs vencidos.
    const retentionDays = Number(_payload?.retentionDays);
    if (Number.isFinite(retentionDays) && retentionDays > 0) {
      results.pruned = pruneOldBackups({ backupsDir, retentionMs: retentionDays * 86400_000, nowMs: now(), fsAdapter });
    }

    return results;
  };
}

/**
 * Identifica directorios de backup vencidos para purga (no los elimina, solo lista).
 * @param {Object} params
 * @param {string} params.backupsDir - Directorio de backups.
 * @param {number} params.retentionMs - Período de retención en ms.
 * @param {number} params.nowMs - Timestamp actual en ms.
 * @param {Object} params.fsAdapter - Adaptador de filesystem.
 * @returns {Object[]} Lista de directorios vencidos {dir, mtime}.
 */
function pruneOldBackups({ backupsDir, retentionMs, nowMs, fsAdapter }) {
  const cutoff = nowMs - retentionMs;
  const pruned = [];
  let entries;
  try { entries = fsAdapter.listDir(backupsDir, { withFileTypes: true }); } catch { return pruned; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = fsAdapter.join(backupsDir, entry.name);
    try {
      const mtime = fsAdapter.fileMtimeMs(full);
      if (mtime < cutoff) pruned.push({ dir: full, mtime });
    } catch { /* desaparecido — ignoramos */ }
  }
  // Nota: el rmdir físico se deja para un job de housekeeping dedicado (evita accidents).
  return pruned;
}
