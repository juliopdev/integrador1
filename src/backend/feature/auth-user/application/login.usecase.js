import { AuthError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso de inicio de sesión de usuario final (end-user) en el tenant.
 * Valida credenciales locales de email/password. A diferencia del panel de administración,
 * no requiere frase de acceso y rechaza cuentas administrativas (con passphraseHash) para prevenir
 * accesos no autorizados.
 *
 * @param {Object} deps - Dependencias de inicio de sesión de usuario.
 * @param {Object} deps.userRepository - Repositorio de usuarios del tenant.
 * @param {Object} deps.verifier - Componente de validación de contraseñas.
 * @param {function(string, string): Promise<boolean>} deps.verifier.verify - Método para verificar texto plano contra hash.
 * @returns {(params: { email: string, password: string }) => Promise<{ userId: string, email: string }>} Función de caso de uso.
 * @throws {AuthError} INVALID_CREDENTIALS - Si el email no existe, es OAuth-only o la contraseña no coincide.
 * @throws {AuthError} ACCOUNT_SUSPENDED - Si la cuenta está suspendida.
 * @throws {AuthError} FORBIDDEN_ADMIN_LOGIN - Si la cuenta tiene passphrase (es administrador).
 */
export function makeLoginUser({ userRepository, verifier }) {
  /**
   * Autentica a un end-user con email y contraseña.
   * Normaliza el email, verifica existencia, estado de la cuenta y que no sea una cuenta
   * administrativa, y finalmente valida la contraseña contra el hash almacenado.
   * @param {Object} params - Credenciales de inicio de sesión.
   * @param {string} params.email - Correo del usuario.
   * @param {string} params.password - Contraseña del usuario.
   * @returns {Promise<{ userId: string, email: string }>} Datos del usuario autenticado.
   * @throws {AuthError} INVALID_CREDENTIALS - Si las credenciales son inválidas.
   * @throws {AuthError} ACCOUNT_SUSPENDED - Si la cuenta está suspendida.
   * @throws {AuthError} FORBIDDEN_ADMIN_LOGIN - Si la cuenta es administrativa.
   */
  return async function loginUser({ email, password }) {
    const normalized = String(email ?? '').trim().toLowerCase();
    const user = userRepository.findByEmail(normalized);
    if (!user || !user.passwordHash) {
      // Email desconocido u OAuth-only: mensaje ambiguo para no leakear existencia de cuentas.
      throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas.');
    }
    if (user.status === 'suspended') {
      throw new AuthError('ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida.');
    }
    if (user.passphraseHash) {
      // Cuentas con passphrase son admins (Master/Staff). No pueden usar la ruta de end-user.
      throw new AuthError('FORBIDDEN_ADMIN_LOGIN', 'Este endpoint es solo para clientes finales.');
    }

    const ok = await verifier.verify(password, user.passwordHash);
    if (!ok) {
      throw new AuthError('INVALID_CREDENTIALS', 'Credenciales inválidas.');
    }
    return { userId: user.id, email: user.email };
  };
}
