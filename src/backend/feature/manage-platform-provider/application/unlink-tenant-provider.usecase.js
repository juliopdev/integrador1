import { DomainError } from '../../../common/errors.js';
import { findContractDependencies } from '../../../infrastructure/providers/find-contract-dependencies.js';

/**
 * Fábrica para el caso de uso que deslinkea (deshabilita) un proveedor del tenant — deselección
 * del paso 2 del asistente v2. La config cifrada se conserva en `tenant_providers` para relinkear
 * sin re-tipear credenciales; `enabled=0` lo saca de toda derivación.
 *
 * Defensa en 2 capas contra deslinkeos peligrosos:
 *  - **Capa 1 (hard block)**: si el CONTRATO PUBLICADO usa el provider, lanza
 *    `PROVIDER_IN_USE_BY_PUBLISHED`. No hay `force` acá.
 *  - **Capa 2 (soft block con `force`)**: si el DRAFT en curso usa el provider, requiere
 *    `force: true` para proceder. Sin `force` lanza `PROVIDER_IN_USE_BY_DRAFT` con
 *    `details.dependencies`.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.providerRepository - Repositorio de proveedores del tenant.
 * @param {Object} [deps.contractRepository] - Repositorio opcional de contratos (para verificar dependencias).
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(params: { category: string, provider: string, force?: boolean }) => Promise<{ category: string, provider: string, unlinked: boolean }>}
 * @throws {DomainError} `PROVIDER_IN_USE_BY_PUBLISHED` | `PROVIDER_IN_USE_BY_DRAFT`
 */
export function makeUnlinkTenantProvider({ providerRepository, contractRepository, now = () => Date.now() }) {
  /**
   * Deslinkea (deshabilita) un proveedor del tenant, con guardas contra dependencias activas.
   * @param {Object} params - Parámetros del deslinkeo.
   * @param {string} params.category - Categoría del proveedor.
   * @param {string} params.provider - Nombre del proveedor.
   * @param {boolean} [params.force=false] - Si es `true`, salta el soft block del draft en curso.
   * @returns {Promise<{ category: string, provider: string, unlinked: boolean }>}
   * @throws {DomainError} `PROVIDER_IN_USE_BY_PUBLISHED` — si un contrato publicado depende del provider.
   * @throws {DomainError} `PROVIDER_IN_USE_BY_DRAFT` — si el draft en curso depende del provider y no se usa `force`.
   */
  return async function unlinkTenantProvider({ category, provider, force = false }) {
    // Capa 1: contrato publicado. `contractRepository` es opcional para no romper composición
    // en tests unit ultra-acotados; en producción siempre viene cableado desde bootstrap.
    if (contractRepository?.getActiveContract) {
      const published = contractRepository.getActiveContract();
      const publishedDeps = findContractDependencies(published?.schema, category, provider);
      if (publishedDeps.length > 0) {
        const version = published.version;
        const err = new DomainError(
          'PROVIDER_IN_USE_BY_PUBLISHED',
          `La versión publicada ${version} usa este provider en ${publishedDeps.length} elemento(s). Publica una versión que no lo use antes de deslinkear.`,
        );
        err.details = { version, dependencies: publishedDeps };
        throw err;
      }
    }

    // Capa 2: draft en curso. Aviso + force explícito.
    if (contractRepository?.getDraft) {
      const draft = contractRepository.getDraft();
      const draftDeps = findContractDependencies(draft?.schema, category, provider);
      if (draftDeps.length > 0 && !force) {
        const err = new DomainError(
          'PROVIDER_IN_USE_BY_DRAFT',
          `El borrador en curso usa este provider en ${draftDeps.length} elemento(s). Reintenta con force=true para deslinkear y dejar esos elementos huérfanos (deberás resolverlos antes de publicar).`,
        );
        err.details = { dependencies: draftDeps };
        throw err;
      }
    }

    providerRepository.disable({ category, provider, now: now() });
    return { category, provider, unlinked: true };
  };
}
