import { AuthError, DomainError } from '../../../common/errors.js';
import { hashToken } from '../../../common/token.js';

/**
 * Fábrica para el caso de uso que restablece la contraseña de un administrador utilizando un token.
 * Consume el token para prevenir reutilización (single-use replay protection) y actualiza el hash de contraseña del usuario.
 * La frase de acceso (2FA) no se modifica durante este flujo.
 *
 * @param {Object} deps - Dependencias de restablecimiento.
 * @param {Object} deps.adminRepository - Repositorio de administradores.
 * @param {Object} deps.hasher - Proveedor de hashing de contraseñas.
 * @param {function(string): Promise<string>} deps.hasher.hash - Método para hashear la nueva contraseña.
 * @param {() => number} [deps.now] - Generador de marcas de tiempo.
 * @returns {(input: { token: string, password: string }) => Promise<{ userId: string }>} Función de caso de uso.
 * @throws {DomainError} WEAK_PASSWORD - Si la contraseña tiene menos de 8 caracteres.
 * @throws {AuthError} INVALID_TOKEN - Si el token de restablecimiento es inválido o expiró.
 */
export function makeAdminResetPass({ adminRepository, hasher, now = () => Date.now() }) {
  /**
   * Procesa el restablecimiento de contraseña de un administrador.
   * Valida la fortaleza de la nueva contraseña, verifica el token de un solo uso,
   * actualiza el hash y marca el token como consumido.
   * @param {Object} input - Datos de restablecimiento.
   * @param {string} input.token - Token crudo de restablecimiento.
   * @param {string} input.password - Nueva contraseña (mínimo 8 caracteres).
   * @returns {Promise<{ userId: string }>} Identificador del usuario cuya contraseña fue actualizada.
   * @throws {DomainError} WEAK_PASSWORD - Si la contraseña no cumple la longitud mínima.
   * @throws {AuthError} INVALID_TOKEN - Si el token no es válido o expiró.
   */
  return async function resetPass({ token, password }) {
    if (typeof password !== 'string' || password.length < 8) {
      throw new DomainError('WEAK_PASSWORD', 'La nueva contraseña debe tener al menos 8 caracteres.');
    }

    const ts = now();
    const validToken = adminRepository.findValidResetToken({ tokenHash: hashToken(String(token ?? '')), now: ts });
    if (!validToken) {
      throw new AuthError('INVALID_TOKEN', 'El enlace es inválido o expiró. Solicitá otro.');
    }

    const passwordHash = await hasher.hash(password);
    adminRepository.updatePassword({ userId: validToken.userId, passwordHash, now: ts });
    adminRepository.markTokenUsed({ tokenId: validToken.id, now: ts });
    return { userId: validToken.userId };
  };
}
