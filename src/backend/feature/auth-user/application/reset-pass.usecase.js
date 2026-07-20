import { AuthError, DomainError } from '../../../common/errors.js';
import { hashToken } from '../../../common/token.js';

/**
 * Fábrica para el caso de uso que restablece la contraseña de un usuario final (end-user).
 * Valida, consume el token de un solo uso para prevenir ataques replay y actualiza el password hash del usuario.
 *
 * @param {Object} deps - Dependencias de restablecimiento.
 * @param {Object} deps.userRepository - Repositorio de usuarios del tenant space.
 * @param {Object} deps.hasher - Proveedor de hashing de contraseñas.
 * @param {function(string): Promise<string>} deps.hasher.hash - Método para hashear la nueva contraseña.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @returns {(params: { token: string, password: string }) => Promise<{ userId: string }>} Función de caso de uso.
 * @throws {DomainError} WEAK_PASSWORD - Si la contraseña tiene menos de 8 caracteres.
 * @throws {AuthError} INVALID_TOKEN - Si el token de restablecimiento es inválido o expiró.
 */
export function makeResetPass({ userRepository, hasher, now = () => Date.now() }) {
  /**
   * Procesa el restablecimiento de contraseña de un end-user.
   * Valida la fortaleza de la nueva contraseña, verifica y consume el token de un solo uso,
   * actualiza el hash y migra el authProvider a 'local' si el usuario era OAuth.
   * @param {Object} params - Datos de restablecimiento.
   * @param {string} params.token - Token crudo de restablecimiento.
   * @param {string} params.password - Nueva contraseña (mínimo 8 caracteres).
   * @returns {Promise<{ userId: string }>} Identificador del usuario actualizado.
   * @throws {DomainError} WEAK_PASSWORD - Si la nueva contraseña es muy débil.
   * @throws {AuthError} INVALID_TOKEN - Si el token no es válido o expiró.
   */
  return async function resetPass({ token, password }) {
    if (typeof password !== 'string' || password.length < 8) {
      throw new DomainError('WEAK_PASSWORD', 'La nueva contraseña debe tener al menos 8 caracteres.');
    }

    const ts = now();
    const validToken = userRepository.findValidResetToken({ tokenHash: hashToken(String(token ?? '')), now: ts });
    if (!validToken) {
      throw new AuthError('INVALID_TOKEN', 'El enlace es inválido o expiró. Solicitá otro.');
    }

    const passwordHash = await hasher.hash(password);
    userRepository.updatePassword({ userId: validToken.userId, passwordHash, now: ts });
    userRepository.markTokenUsed({ tokenId: validToken.id, now: ts });
    return { userId: validToken.userId };
  };
}
