import { uuidv7 } from '../../../common/id.js';
import { DomainError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso que registra a un nuevo usuario final (end-user) en el tenant.
 * Autoprovisiona el rol de cliente final 'user' con permisos vacíos en caso de que falte en el tenant,
 * hashea la contraseña del usuario y crea su perfil local con estado activo.
 *
 * @param {Object} deps - Dependencias de registro.
 * @param {Object} deps.userRepository - Repositorio de usuarios del tenant space.
 * @param {Object} deps.hasher - Proveedor de hashing de contraseñas.
 * @param {function(string): Promise<string>} deps.hasher.hash - Método para generar hash de contraseñas.
 * @param {Function} [deps.onRegisterSuccess] - Callback opcional tras registro exitoso.
 * @param {(p: { userId: string, email: string, passwordHash: string }) => Promise<void>} [deps.onRegisterSuccess] - Firma del callback.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @returns {(params: { email: string, password: string }) => Promise<{ userId: string, email: string }>} Función de caso de uso.
 * @throws {DomainError} EMAIL_TAKEN - Si ya existe un usuario con ese correo en el tenant.
 */
export function makeRegisterUser({ userRepository, hasher, onRegisterSuccess, now = () => Date.now() }) {
  /**
   * Registra un nuevo usuario final en el tenant.
   * Normaliza el email, verifica unicidad, auto-provisiona el rol `user` si es necesario,
   * hashea la contraseña y persiste el usuario con estado activo.
   * @param {Object} params - Datos de registro.
   * @param {string} params.email - Correo del nuevo usuario.
   * @param {string} params.password - Contraseña (mínimo 8 caracteres según schema).
   * @returns {Promise<{ userId: string, email: string }>} Identificador y email del usuario creado.
   * @throws {DomainError} EMAIL_TAKEN - Si el email ya está registrado en este tenant.
   */
  return async function registerUser({ email, password }) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (userRepository.findByEmail(normalizedEmail)) {
      throw new DomainError('EMAIL_TAKEN', 'Ya existe un usuario con ese correo en este tenant.');
    }

    // Rol `user` auto-provisionado en el tenant (categoría user). Si el Superadmin no lo definió
    // en el asistente, se crea acá al primer registro (permisos vacíos por default).
    let role = userRepository.findUserRoleByName('user');
    if (!role) {
      role = userRepository.createUserRole({ name: 'user', category: 'user', now: now() });
    }

    const userId = uuidv7();
    const ts = now();
    const passwordHash = await hasher.hash(password);
    userRepository.insertUser({
      id: userId,
      email: normalizedEmail,
      passwordHash,
      authProvider: 'local',
      status: 'active',
      now: ts,
    });
    userRepository.assignRole({ userId, roleId: role.id, now: ts });

    if (onRegisterSuccess) {
      await onRegisterSuccess({ userId, email: normalizedEmail, passwordHash });
    }

    return { userId, email: normalizedEmail };
  };
}
