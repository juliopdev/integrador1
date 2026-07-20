import { eq, isNull } from 'drizzle-orm';
import { frontendDeploys, tenants } from '../../../config/drizzle/schema-platform.js';

/**
 * Repositorio de despliegues de frontend. Persiste `mode` + `external_url` + `status` en
 * `platform.db.frontend_deploys`. Único registro activo por tenant (UNIQUE en `tenant_id`) — el
 * upsert reemplaza el anterior si existe. Ver manage-platform-frontend.md.
 *
 * @param {{ db: object }} deps
 */
export function createDeployRepository({ db }) {
  return {
    /**
     * Lista todos los tenants (soft-deleted excluidos) con su deploy asociado.
     * @returns {Object[]} Tenants con datos del deploy (deployMode=null si no tiene).
     */
    listWithTenants() {
      return db
        .select({
          tenantId: tenants.id,
          subdomain: tenants.subdomain,
          projectName: tenants.projectName,
          tenantStatus: tenants.status,
          deployId: frontendDeploys.id,
          deployMode: frontendDeploys.mode,
          deployExternalUrl: frontendDeploys.externalUrl,
          deployStatus: frontendDeploys.status,
          deployUpdatedAt: frontendDeploys.updatedAt,
        })
        .from(tenants)
        .leftJoin(frontendDeploys, eq(frontendDeploys.tenantId, tenants.id))
        .where(isNull(tenants.deletedAt))
        .all();
    },

    /**
     * Busca el deploy actual del tenant.
     * @param {string} tenantId - ID del tenant.
     * @returns {Object|null} Deploy o null si nunca configuró.
     */
    findByTenantId(tenantId) {
      const rows = db.select().from(frontendDeploys).where(eq(frontendDeploys.tenantId, tenantId)).limit(1).all();
      return rows[0] ?? null;
    },

    /**
     * Upsert del deploy: si ya existe uno para el tenant → UPDATE (sustituye mode/externalUrl/
     * envVarsJson/extractedPath/status/updatedAt); sino → INSERT. El `id` se genera fuera (uuidv7)
     * y se ignora en el UPDATE.
     */
    /**
     * Upsert del deploy: inserta o actualiza según exista registro previo para el tenant.
     * @param {Object} params
     * @param {string} params.id - UUIDv7 del deploy.
     * @param {string} params.tenantId - ID del tenant.
     * @param {string} params.mode - "hosted" | "external".
     * @param {string|null} params.externalUrl - URL externa (modo external).
     * @param {string|null} [params.envVarsJson] - JSON de variables de entorno.
     * @param {string|null} [params.extractedPath] - Ruta de extracción (modo hosted).
     * @param {string} params.status - "active" | "disabled".
     * @param {number} params.now - Timestamp actual.
     * @returns {string} ID del deploy (existente o nuevo).
     */
    upsert({ id, tenantId, mode, externalUrl, envVarsJson, extractedPath, status, now }) {
      const existing = db.select({ id: frontendDeploys.id })
        .from(frontendDeploys).where(eq(frontendDeploys.tenantId, tenantId)).limit(1).all()[0];
      if (existing) {
        db.update(frontendDeploys)
          .set({ mode, externalUrl, envVarsJson, extractedPath, status, updatedAt: now })
          .where(eq(frontendDeploys.tenantId, tenantId))
          .run();
        return existing.id;
      }
      db.insert(frontendDeploys).values({
        id, tenantId, mode, externalUrl, envVarsJson, extractedPath, status, createdAt: now, updatedAt: now,
      }).run();
      return id;
    },

    /**
     * Borra el deploy del tenant (idempotente).
     * @param {string} tenantId - ID del tenant.
     * @returns {number} Número de filas afectadas.
     */
    deleteByTenantId(tenantId) {
      const res = db.delete(frontendDeploys).where(eq(frontendDeploys.tenantId, tenantId)).run();
      return res.changes;
    },
  };
}
