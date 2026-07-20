import { DomainError } from '../../../common/errors.js';
import { encrypt } from '../../../common/crypto.js';
import { defaultSettingsFor } from '../../../infrastructure/providers/registry.js';

/**
 * Fábrica para el caso de uso que asocia un proveedor a un tenant: **valida la conexión** con la
 * config dada y, si conecta, la guarda **cifrada** (AES-256-GCM) en `tenant_providers`. Todos los
 * proveedores seleccionados deben conectar OK para avanzar el asistente. `testConnection` se inyecta.
 *
 * P8.4b: al linkear un provider por PRIMERA vez, se guardan los `settings` default declarados en el
 * registry (`desc.settings.fields[].default`). Re-linkear (upsert sobre existente) NO pisa las
 * settings — el Master conserva sus toggles.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.providerRepository - Repositorio de proveedores del tenant.
 * @param {(params: { category: string, provider: string, config: object }) => Promise<boolean>} deps.testConnection
 *   - Función que prueba la conexión contra el proveedor externo.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(params: { category: string, provider: string, config: object }) => Promise<{ category: string, provider: string }>}
 * @throws {DomainError} `PROVIDER_CONNECTION_FAILED` — si la conexión de prueba falla.
 */
export function makeLinkTenantProvider({ providerRepository, testConnection, now = () => Date.now() }) {
  /**
   * Linkea (asocia) un proveedor a un tenant tras validar la conexión.
   * @param {Object} params - Parámetros del link.
   * @param {string} params.category - Categoría del proveedor (ej. `database`, `auth`).
   * @param {string} params.provider - Nombre del proveedor (ej. `neon`, `google`).
   * @param {object} params.config - Configuración de conexión (se cifra antes de persistir).
   * @returns {Promise<{ category: string, provider: string }>}
   * @throws {DomainError} `PROVIDER_CONNECTION_FAILED` — si la conexión de prueba no es exitosa.
   */
  return async function linkTenantProvider({ category, provider, config }) {
    // `category` viaja a `testConnection` para que la validación pueda distinguir combos como
    // `database/neon` vs `auth/google`. Antes se pasaba solo `{ provider, config }` — bug latente
    // resuelto en Iteration 25 al soportar múltiples categorías.
    const ok = await testConnection({ category, provider, config });
    if (!ok) {
      throw new DomainError('PROVIDER_CONNECTION_FAILED', 'No se pudo conectar con el proveedor usando esas credenciales.');
    }

    // P8.4b: si es un link NUEVO y el provider declara settings en el registry, insertamos los
    // defaults. Si ya existía, el repo preserva `settingsJson` (no lo pisa en updates).
    const existing = providerRepository.getSettings?.({ category, provider });
    const settingsToPersist = existing !== null
      ? undefined // no pisar; el upsert deja settingsJson intacto si es undefined
      : JSON.stringify(defaultSettingsFor({ category, provider }));

    providerRepository.upsert({
      category,
      provider,
      configValuesJson: JSON.stringify(encrypt(JSON.stringify(config))),
      settingsJson: settingsToPersist,
      now: now(),
    });
    return { category, provider };
  };
}
