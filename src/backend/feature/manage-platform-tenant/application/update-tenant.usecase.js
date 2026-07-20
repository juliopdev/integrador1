import { DomainError, NotFoundError } from '../../../common/errors.js';

const MAX_PROJECT_NAME = 80;

/**
 * Fábrica para el caso de uso que actualiza los datos editables de un tenant existente. Hoy sólo
 * el `projectName` (nombre visible de la web). El subdominio es deliberadamente INMUTABLE tras el
 * alta: es la identidad física del tenant (redirects del contrato publicado, cookies host-only de
 * sesión, caché de subdominio, link de activación ya enviado) — cambiarlo en caliente desincroniza
 * OAuth y rompe sesiones. Por eso no se expone aquí.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.tenantRepository - Repositorio de tenants de plataforma.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(params: { tenantId: string, projectName: string }) => Promise<{ id: string, projectName: string }>}
 * @throws {DomainError} `INVALID_PROJECT_NAME` — si el nombre está vacío o excede el máximo.
 * @throws {NotFoundError} `TENANT_NOT_FOUND` — si el tenant no existe.
 */
export function makeUpdateTenant({ tenantRepository, now = () => Date.now() }) {
  /**
   * Actualiza el nombre visible del proyecto de un tenant.
   * @param {Object} params - Parámetros de actualización.
   * @param {string} params.tenantId - ID del tenant.
   * @param {string} params.projectName - Nuevo nombre del proyecto (1–80 caracteres).
   * @returns {Promise<{ id: string, projectName: string }>}
   * @throws {DomainError} `INVALID_PROJECT_NAME`
   * @throws {NotFoundError} `TENANT_NOT_FOUND`
   */
  return async function updateTenant({ tenantId, projectName }) {
    const name = String(projectName ?? '').trim();
    if (name.length < 1 || name.length > MAX_PROJECT_NAME) {
      throw new DomainError('INVALID_PROJECT_NAME', `El nombre del proyecto debe tener entre 1 y ${MAX_PROJECT_NAME} caracteres.`);
    }

    const tenant = tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', 'El tenant no existe.');
    }

    tenantRepository.updateProjectName({ tenantId, projectName: name, now: now() });
    return { id: tenantId, projectName: name };
  };
}
