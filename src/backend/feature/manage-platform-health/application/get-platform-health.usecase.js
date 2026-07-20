/**
 * Métricas del VPS y de la plataforma consumidas por `/dashboard/health` (Superadmin).
 *
 * **Trade-off Slice A**: la lectura es *snapshot* (no SSE stream). El navegador refresca la vista
 * cada N segundos; suficiente para MVP. SSE queda para Slice B cuando queramos live-charts.
 *
 * Uso del disco: recorremos `data/` (platform.db + tenants + backups) y devolvemos bytes por
 * directorio. **No** consultamos `df` — sin dep nativa. La visión completa del filesystem del VPS
 * viene con `manage-platform-log` cuando tengamos el agente de métricas.
 *
 * @param {{
 *   platformCounts: () => object,
 *   jobsSummary?: () => object,
 *   dataDir: string,
 *   tenantsDbDir: string,
 *   systemMetrics: object,
 * }} deps
 * @returns {() => Promise<{generatedAt: number, system: Object, storage: Object, platform: Object, jobs: Object}>} Función de caso de uso.
 */
export function makeGetPlatformHealth({ platformCounts, jobsSummary, dataDir, tenantsDbDir, systemMetrics }) {
  /**
   * Obtiene métricas del VPS y de la plataforma (snapshot).
   * @returns {Promise<{generatedAt: number, system: Object, storage: Object, platform: Object, jobs: Object}>}
   */
  return async function getPlatformHealth() {
    const now = Date.now();

    const total = systemMetrics.totalMemory();
    const free = systemMetrics.freeMemory();
    const load = systemMetrics.loadAvg();

    const system = {
      hostname: systemMetrics.hostname(),
      platform: systemMetrics.platform(),
      arch: systemMetrics.arch(),
      nodeVersion: systemMetrics.nodeVersion,
      uptimeSec: systemMetrics.uptimeSec(),
      memory: {
        totalBytes: total,
        freeBytes: free,
        usedBytes: total - free,
        usagePct: total > 0 ? Math.round(((total - free) / total) * 100) : 0,
      },
      cpu: {
        cores: systemMetrics.cpuCount(),
        loadavg1: load[0] ?? 0,
        loadavg5: load[1] ?? 0,
        loadavg15: load[2] ?? 0,
      },
    };

    const storage = {
      platformDb: { path: systemMetrics.join(dataDir, 'platform.db'), bytes: systemMetrics.fileSize(systemMetrics.join(dataDir, 'platform.db')) },
      tenantDbs: systemMetrics.sumDirSize(tenantsDbDir),
      backups: systemMetrics.sumDirSize(systemMetrics.join(dataDir, 'backups')),
    };

    const platform = platformCounts();
    const jobs = jobsSummary
      ? jobsSummary()
      : { byStatus: { pending: 0, processing: 0, completed: 0, failed: 0 }, recent: [] };

    return { generatedAt: now, system, storage, platform, jobs };
  };
}
