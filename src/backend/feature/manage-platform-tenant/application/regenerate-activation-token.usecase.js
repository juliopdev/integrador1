import { DomainError, NotFoundError } from '../../../common/errors.js';
import { uuidv7 } from '../../../common/id.js';
import { generateToken } from '../../../common/token.js';

const ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días (mismo TTL que el alta inicial).

/**
 * Fábrica para el caso de uso que REGENERA el token de activación del Master dentro del
 * `tenant.db`. Se usa para reenviar la invitación cuando el Master nunca activó su cuenta
 * (el link original pudo expirar a los 7 días). Invalida los tokens de activación previos
 * (defensa: el link viejo deja de servir) y emite uno nuevo.
 *
 * Guardas:
 *  - Sin Master asignado → `MASTER_NOT_FOUND` (404).
 *  - Master ya activo (`status !== 'invited'`) → `MASTER_ALREADY_ACTIVE` (422): no procede reenviar.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.onboardingRepository - Repositorio de onboarding conectado al `tenant.db`.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @param {number} [deps.ttlMs] - TTL del nuevo token en ms (default: 7 días).
 * @returns {() => { email: string, rawToken: string }}
 * @throws {NotFoundError} `MASTER_NOT_FOUND` — si el tenant no tiene Master asignado.
 * @throws {DomainError} `MASTER_ALREADY_ACTIVE` — si el Master ya activó su cuenta.
 */
export function makeRegenerateActivationToken({ onboardingRepository, now = () => Date.now(), ttlMs = ACTIVATION_TTL_MS }) {
  /**
   * Invalida tokens previos y genera un nuevo token de activación para el Master.
   * @returns {{ email: string, rawToken: string }} Correo del Master y nuevo token en crudo.
   * @throws {NotFoundError} `MASTER_NOT_FOUND`
   * @throws {DomainError} `MASTER_ALREADY_ACTIVE`
   */
  return function regenerateActivationToken() {
    const master = onboardingRepository.findMaster();
    if (!master) {
      throw new NotFoundError('MASTER_NOT_FOUND', 'El tenant no tiene un Master asignado.');
    }
    if (master.status !== 'invited') {
      throw new DomainError('MASTER_ALREADY_ACTIVE', 'El Master ya activó su cuenta; no procede reenviar la invitación.');
    }

    const ts = now();
    onboardingRepository.deleteActivationTokens({ userId: master.id });
    const { raw, hash } = generateToken();
    onboardingRepository.insertActivationToken({ id: uuidv7(), userId: master.id, tokenHash: hash, expiresAt: ts + ttlMs, now: ts });

    return { email: master.email, rawToken: raw };
  };
}
