import { AuthError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso de inicio de sesión de administradores (Superadmin / Master / Staff).
 * Compara en tiempo constante tanto la contraseña como la frase de acceso (2FA obligatorio)
 * para mitigar ataques de fuga de tiempos y enumeración de cuentas.
 *
 * @param {Object} deps - Dependencias de autenticación.
 * @param {Object} deps.adminRepository - Repositorio de persistencia de administradores.
 * @param {Object} deps.verifier - Componente validador de contraseñas.
 * @param {function(string, string): Promise<boolean>} deps.verifier.verify - Método para comparar texto plano con hash.
 * @param {'platform'|'tenant'} deps.scope - Ámbito de seguridad a retornar.
 * @param {function(Object): boolean} deps.isActive - Predicado para validar el estado de actividad del administrador.
 * @returns {(input: { email: string, password: string, passphrase: string }) => Promise<{ userId: string, email: string, scope: string }>} Función de caso de uso.
 * @throws {AuthError} INVALID_CREDENTIALS - Si el usuario no existe, está borrado, inactivo o las credenciales no coinciden.
 */
export function makeLogin({ adminRepository, verifier, scope, isActive }) {
  /**
   * Autentica a un administrador con doble factor (password + passphrase).
   * Realiza ambas verificaciones en paralelo usando tiempo constante para mitigar
   * ataques de timing y enumeración de cuentas.
   * @param {Object} input - Credenciales de inicio de sesión.
   * @param {string} input.email - Correo del administrador.
   * @param {string} input.password - Contraseña del administrador.
   * @param {string} input.passphrase - Frase de acceso (2FA) del administrador.
   * @returns {Promise<{ userId: string, email: string, scope: string }>} Datos del usuario autenticado y ámbito.
   * @throws {AuthError} INVALID_CREDENTIALS - Si las credenciales son inválidas.
   */
  return async function login({ email, password, passphrase }) {
    const user = await adminRepository.findByEmail(email);

    // Comparar ambos factores siempre (verifier maneja hash nulo con un dummy en tiempo constante).
    const [passwordOk, passphraseOk] = await Promise.all([
      verifier.verify(password, user?.passwordHash),
      verifier.verify(passphrase, user?.passphraseHash),
    ]);

    if (!user || user.deletedAt || !isActive(user) || !passwordOk || !passphraseOk) {
      throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas.');
    }

    return { userId: user.id, email: user.email, scope };
  };
}
