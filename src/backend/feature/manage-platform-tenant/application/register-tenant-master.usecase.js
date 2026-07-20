import { uuidv7 } from '../../../common/id.js';
import { generateToken } from '../../../common/token.js';

const ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

/**
 * Fábrica para el caso de uso que registra al usuario principal administrador (Master) en la
 * base de datos del tenant. Crea el rol 'master' si no existe, inserta al usuario Master como
 * 'invited' y genera el token de activación.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.repository - Repositorio de usuarios/roles del tenant (`tenant-onboarding.repository.js`).
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @param {number} [deps.ttlMs] - Tiempo de expiración del token de activación (ms, default: 7 días).
 * @returns {(params: { email: string }) => Promise<{ userId: string, email: string, rawToken: string }>}
 */
export function makeRegisterTenantMaster({ repository, now = () => Date.now(), ttlMs = ACTIVATION_TTL_MS }) {
  /**
   * Registra al Master del tenant: crea el rol, el usuario y el token de activación.
   * @param {Object} params - Parámetros de registro.
   * @param {string} params.email - Correo electrónico del Master.
   * @returns {Promise<{ userId: string, email: string, rawToken: string }>}
   *   Datos del Master creado y el token de activación en crudo.
   */
  return async function registerTenantMaster({ email }) {
    const ts = now();

    let role = repository.findRoleByName('master');
    if (!role) {
      role = { id: uuidv7() };
      repository.insertRole({ id: role.id, name: 'master', category: 'master', isReserved: 1, now: ts });
    }

    const userId = uuidv7();
    repository.insertUser({ id: userId, email, status: 'invited', now: ts });
    repository.assignRole({ userId, roleId: role.id, now: ts });

    const { raw, hash } = generateToken();
    repository.insertActivationToken({ id: uuidv7(), userId, tokenHash: hash, expiresAt: ts + ttlMs, now: ts });

    return { userId, email, rawToken: raw };
  };
}
