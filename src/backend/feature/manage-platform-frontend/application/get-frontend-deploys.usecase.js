/**
 * Lista todos los tenants activos y su deploy actual (si tiene). Sirve la vista SSR del
 * Superadmin: `/dashboard/frontends`. Cada fila es `{ tenant, deploy | null }`.
 *
 * @param {{ deployRepository: object }} deps
 * @returns {() => Promise<Object[]>} Función de caso de uso.
 */
export function makeGetFrontendDeploys({ deployRepository }) {
  /**
   * Lista todos los tenants activos con su deploy actual (si tiene).
   * @returns {Promise<Object[]>} Array de {tenantId, subdomain, projectName, tenantStatus, deploy|null}.
   */
  return async function getFrontendDeploys() {
    const rows = deployRepository.listWithTenants();
    return rows.map((r) => ({
      tenantId: r.tenantId,
      subdomain: r.subdomain,
      projectName: r.projectName,
      tenantStatus: r.tenantStatus,
      deploy: r.deployId ? {
        id: r.deployId,
        mode: r.deployMode,
        externalUrl: r.deployExternalUrl,
        status: r.deployStatus,
        updatedAt: r.deployUpdatedAt,
      } : null,
    }));
  };
}
