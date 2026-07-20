import { randomBytes } from 'node:crypto';
import { uuidv7 } from '../../../common/id.js';
import { hashToken } from '../../../common/token.js';

// Nombre canónico de la key que el front del tenant usa para hablar con su backend No-Code.
const FRONTEND_KEY_NAME = 'frontend';

/**
 * Fábrica para el caso de uso que emite (o re-emite) la API key "frontend" del tenant (PLAN-ux2 P4).
 * Regenerar revoca la key activa anterior — solo hay una vigente. Devuelve el valor CRUDO una única
 * vez (`mbk_…`); en la tabla queda únicamente el hash SHA-256. El enforcement en `/api/v1/*` llega
 * con la gramática v2 (P6); hasta entonces la key es material de conexión para el front del tenant.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.apiKeyRepository - Repositorio de API keys del tenant.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @returns {() => Promise<{ id: string, apiKey: string, createdAt: number, regenerated: boolean }>} Función de caso de uso.
 */
export function makeGenerateApiKey({ apiKeyRepository, now = () => Date.now() }) {
  /**
   * Genera o regenera la API key "frontend" del tenant.
   * Si existe una key activa previa, la revoca antes de emitir la nueva.
   * @returns {Promise<{ id: string, apiKey: string, createdAt: number, regenerated: boolean }>}
   */
  return async function generateApiKey() {
    const ts = now();
    const previous = apiKeyRepository.findActiveByName(FRONTEND_KEY_NAME);
    if (previous) {
      apiKeyRepository.revokeKey({ id: previous.id, now: ts });
    }

    const rawKey = `mbk_${randomBytes(24).toString('base64url')}`;
    const id = uuidv7();
    apiKeyRepository.insertKey({
      id,
      name: FRONTEND_KEY_NAME,
      tokenHash: hashToken(rawKey),
      scopesJson: JSON.stringify(['frontend']),
      now: ts,
    });

    return { id, apiKey: rawKey, createdAt: ts, regenerated: Boolean(previous) };
  };
}
