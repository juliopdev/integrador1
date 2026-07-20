// Nombre canónico compartido con generate-api-key.usecase.
const FRONTEND_KEY_NAME = 'frontend';

/**
 * Fábrica para el caso de uso que consulta el estado de la API key "frontend" del tenant (PLAN-ux2 P4)
 * — para la columna Keys del listado. NUNCA devuelve el valor crudo (solo existe el hash);
 * si se perdió, se regenera.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.apiKeyRepository - Repositorio de API keys del tenant.
 * @returns {() => Promise<{ exists: boolean, id?: string, createdAt?: number, lastUsedAt?: number|null }>} Función de caso de uso.
 */
export function makeGetApiKeyStatus({ apiKeyRepository }) {
  /**
   * Obtiene el estado de la API key "frontend".
   * @returns {Promise<{ exists: boolean, id?: string, createdAt?: number, lastUsedAt?: number|null }>}
   */
  return async function getApiKeyStatus() {
    const key = apiKeyRepository.findActiveByName(FRONTEND_KEY_NAME);
    if (!key) return { exists: false };
    return {
      exists: true,
      id: key.id,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt ?? null,
    };
  };
}
