import { uuidv7 } from '../../../common/id.js';
import { AuthError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso de inicio de sesión / registro (upsert) mediante proveedores OAuth externos (ej. Google).
 * Verifica la existencia del perfil en base al providerUserId único. Protege contra account takeover
 * bloqueando el registro si el email ya pertenece a una cuenta local sin vinculación previa.
 *
 * @param {Object} deps - Dependencias de OAuth.
 * @param {Object} deps.userRepository - Repositorio de usuarios del tenant space.
 * @param {Function} [deps.onLoginSuccess] - Callback opcional ejecutado tras login/registro exitoso.
 * @param {(p: { userId: string, email: string, name: string }) => Promise<void>} [deps.onLoginSuccess] - Firma del callback.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @returns {(params: { authProvider: string, profile: { sub: string, email: string } }) => Promise<{ userId: string, email: string }>} Función de caso de uso.
 * @throws {AuthError} INVALID_PROFILE - Si el perfil del proveedor no tiene `sub` o `email`.
 * @throws {AuthError} ACCOUNT_SUSPENDED - Si la cuenta OAuth existente está suspendida.
 * @throws {AuthError} EMAIL_TAKEN_BY_LOCAL - Si el email ya pertenece a una cuenta local.
 */
export function makeOAuthLogin({ userRepository, onLoginSuccess, now = () => Date.now() }) {
  /**
   * Procesa el login o registro upsert mediante OAuth.
   * Si el usuario ya existe por providerUserId, retorna sus datos. Si no, verifica que no haya
   * colisión de email con cuenta local y auto-provisiona un nuevo usuario con rol `user`.
   * @param {Object} params - Parámetros OAuth.
   * @param {string} params.authProvider - Nombre del proveedor (ej: 'google').
   * @param {Object} params.profile - Perfil devuelto por el proveedor.
   * @param {string} params.profile.sub - Identificador único del usuario en el proveedor.
   * @param {string} params.profile.email - Correo del usuario.
   * @param {string} [params.profile.name] - Nombre opcional del usuario.
   * @returns {Promise<{ userId: string, email: string }>} Datos del usuario autenticado o creado.
   * @throws {AuthError} INVALID_PROFILE - Si el perfil no contiene sub o email.
   * @throws {AuthError} ACCOUNT_SUSPENDED - Si la cuenta está suspendida.
   * @throws {AuthError} EMAIL_TAKEN_BY_LOCAL - Si el email colisiona con cuenta local.
   */
  return async function oauthLogin({ authProvider, profile }) {
    if (!profile?.sub || !profile?.email) {
      throw new AuthError('INVALID_PROFILE', 'El perfil del proveedor no trae `sub` o `email`.');
    }
    const normalizedEmail = String(profile.email).trim().toLowerCase();

    const existing = userRepository.findByProvider({ authProvider, providerUserId: profile.sub });
    if (existing) {
      if (existing.status === 'suspended') {
        throw new AuthError('ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida.');
      }
      if (onLoginSuccess) {
        await onLoginSuccess({ userId: existing.id, email: existing.email, name: profile.name || profile.given_name });
      }
      return { userId: existing.id, email: existing.email };
    }

    // No existe por (provider, sub). Antes de crear, revisar colisión de email con un user local.
    const emailCollision = userRepository.findByEmail(normalizedEmail);
    if (emailCollision && emailCollision.authProvider === 'local') {
      throw new AuthError('EMAIL_TAKEN_BY_LOCAL',
        'Existe una cuenta local con ese correo. Iniciá sesión con tu password para vincular OAuth.');
    }

    // Auto-provisiona el rol `user` si no existe (mismo patrón que register.usecase).
    let role = userRepository.findUserRoleByName('user');
    if (!role) {
      role = userRepository.createUserRole({ name: 'user', category: 'user', now: now() });
    }

    const userId = uuidv7();
    const ts = now();
    userRepository.insertOAuthUser({
      id: userId,
      email: normalizedEmail,
      authProvider,
      providerUserId: profile.sub,
      status: 'active',
      now: ts,
    });
    userRepository.assignRole({ userId, roleId: role.id, now: ts });

    if (onLoginSuccess) {
      await onLoginSuccess({ userId, email: normalizedEmail, name: profile.name || profile.given_name });
    }

    return { userId, email: normalizedEmail };
  };
}
