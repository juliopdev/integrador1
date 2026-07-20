import { createHash } from 'node:crypto';
import { DomainError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que define las credenciales iniciales de un administrador (activación de cuenta).
 * Permite definir contraseña y frase de acceso (2FA obligatorio) canjeando un token válido de un solo uso.
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.adminRepository - Repositorio de administradores.
 * @param {Object} deps.hasher - Proveedor de hashing de contraseñas.
 * @param {function(string): Promise<string>} deps.hasher.hash - Método para hashear contraseñas.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @returns {(input: { rawToken: string, password: string, passphrase: string }) => Promise<{ userId: string }>} Función de caso de uso.
 * @throws {DomainError} INVALID_OR_EXPIRED_TOKEN - Si el token de activación es inválido o ya expiró.
 */
export function makeRegisterAdminCredentials({ adminRepository, hasher, now = () => Date.now() }) {
  /**
   * Activa la cuenta de un administrador estableciendo su contraseña y frase de acceso por primera vez.
   * Valida el token de activación/invitación, hashea ambos factores y persiste las credenciales
   * de forma atómica junto con el consumo del token.
   * @param {Object} input - Datos de activación.
   * @param {string} input.rawToken - Token crudo de activación recibido por correo.
   * @param {string} input.password - Nueva contraseña (mínimo 8 caracteres).
   * @param {string} input.passphrase - Nueva frase de acceso 2FA (mínimo 12 caracteres).
   * @returns {Promise<{ userId: string }>} Identificador del usuario activado.
   * @throws {DomainError} INVALID_OR_EXPIRED_TOKEN - Si el token no existe o expiró.
   */
  return async function registerAdminCredentials({ rawToken, password, passphrase }) {
    const ts = now();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const token = await adminRepository.findValidActivationToken(tokenHash, ts);
    if (!token) {
      throw new DomainError('INVALID_OR_EXPIRED_TOKEN', 'El enlace de activación es inválido o ya expiró.');
    }

    const [passwordHash, passphraseHash] = await Promise.all([hasher.hash(password), hasher.hash(passphrase)]);

    await adminRepository.setCredentialsAndConsumeToken({
      userId: token.userId,
      tokenId: token.id,
      passwordHash,
      passphraseHash,
      now: ts,
    });

    return { userId: token.userId };
  };
}
