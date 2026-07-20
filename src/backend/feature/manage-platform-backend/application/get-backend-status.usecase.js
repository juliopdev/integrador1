/**
 * Estado del backend de un tenant, para pintar el chip del listado (`/dashboard/backends`). Deriva
 * del `contract.repository` sin abrir más conexiones nuevas — el pool LRU ya está caliente por otras
 * operaciones. Retorna una proyección slim (nunca el `schema_json` completo). Ver
 * `.doc/tree/src/backend/feature/manage-platform-backend.md`.
 *
 * Shape del resultado:
 * ```
 * {
 *   published: { version, publishedAt } | null,
 *   draft:     { version } | null,
 *   versionCount: number
 * }
 * ```
 *
 * @param {{ contractRepository: object }} deps
 * @returns {() => Promise<{published: {version: string, publishedAt: number|null}|null, draft: {version: string}|null, versionCount: number}>} Función de caso de uso.
 */
export function makeGetBackendStatus({ contractRepository }) {
  /**
   * Retorna una proyección slim del estado del backend de un tenant.
   * @returns {Promise<{published: {version: string, publishedAt: number|null}|null, draft: {version: string}|null, versionCount: number}>}
   */
  return async function getBackendStatus() {
    const all = contractRepository.list?.() ?? [];
    const published = all.find((c) => c.status === 'published') ?? null;
    const draftRow = contractRepository.getDraft?.() ?? null;
    return {
      published: published
        ? { version: published.version, publishedAt: published.publishedAt ?? null }
        : null,
      draft: draftRow ? { version: draftRow.version } : null,
      versionCount: all.length,
    };
  };
}
