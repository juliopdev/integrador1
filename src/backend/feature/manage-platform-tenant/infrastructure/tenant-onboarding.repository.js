import { and, eq, isNull } from 'drizzle-orm';
import { roles, tenantUsers, userRoles, authTokens } from '../../../config/drizzle/schema-tenant.js';

/**
 * @typedef {Object} TenantOnboardingRepository
 * @property {function(string): (Object|null)} findRoleByName - Busca un rol en la base de datos del tenant por su nombre.
 * @property {function(Object): void} insertRole - Inserta un nuevo rol en la tabla de roles del tenant.
 * @property {function(Object): void} insertUser - Inserta un nuevo colaborador/usuario en la tabla de usuarios del tenant.
 * @property {function(Object): void} assignRole - Vincula un rol con un usuario en la tabla asociativa del tenant.
 * @property {function(Object): void} insertActivationToken - Inserta el token de activación de tipo 'activation' en la tabla de tokens del tenant.
 * @property {function(): (Object|null)} findMaster - Devuelve `{ id, email, status }` del master, o `null`.
 * @property {function(Object): void} deleteActivationTokens - Invalida los tokens de activación previos de un usuario.
 */

/**
 * Fábrica para el repositorio de alta inicial (onboarding) dentro del contexto de base de datos
 * de un tenant. Realiza operaciones de escritura inicial en la base de datos SQLite específica
 * del cliente (`tenantId.db`).
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.db - Instancia de Drizzle conectada a la base SQLite del tenant.
 * @returns {TenantOnboardingRepository}
 */
export function createTenantOnboardingRepository({ db }) {
  return {
    /**
     * Busca un rol por su nombre exacto.
     * @param {string} name - Nombre del rol.
     * @returns {Object|null} Rol encontrado o `null`.
     */
    findRoleByName(name) {
      const rows = db.select().from(roles).where(eq(roles.name, name)).limit(1).all();
      return rows[0] ?? null;
    },
    /**
     * Inserta un nuevo rol en la base de datos del tenant.
     * @param {Object} params - Datos del rol.
     * @param {string} params.id - ID único del rol.
     * @param {string} params.name - Nombre del rol.
     * @param {string} params.category - Categoría del rol.
     * @param {number} params.isReserved - 1 si es reservado, 0 si no.
     * @param {number} params.now - Timestamp de creación (ms).
     */
    insertRole({ id, name, category, isReserved, now }) {
      db.insert(roles).values({ id, name, category, isReserved, createdAt: now, updatedAt: now }).run();
    },
    /**
     * Inserta un nuevo usuario (Master) en la tabla de usuarios del tenant.
     * @param {Object} params - Datos del usuario.
     * @param {string} params.id - ID único del usuario.
     * @param {string} params.email - Correo electrónico del usuario.
     * @param {string} params.status - Estado del usuario (`invited`|`active`).
     * @param {number} params.now - Timestamp de creación (ms).
     */
    insertUser({ id, email, status, now }) {
      db.insert(tenantUsers).values({ id, email, status, createdAt: now, updatedAt: now }).run();
    },
    /**
     * Asigna un rol a un usuario en la tabla asociativa `user_roles`.
     * @param {Object} params - Datos de la asignación.
     * @param {string} params.userId - ID del usuario.
     * @param {string} params.roleId - ID del rol.
     * @param {number} params.now - Timestamp de asignación (ms).
     */
    assignRole({ userId, roleId, now }) {
      db.insert(userRoles).values({ userId, roleId, assignedAt: now }).run();
    },
    /**
     * Inserta un token de activación de tipo `'activation'` en la tabla de tokens del tenant.
     * @param {Object} params - Datos del token.
     * @param {string} params.id - ID único del token.
     * @param {string} params.userId - ID del usuario propietario.
     * @param {string} params.tokenHash - Hash del token de activación.
     * @param {number} params.expiresAt - Timestamp de expiración (ms).
     * @param {number} params.now - Timestamp de creación (ms).
     */
    insertActivationToken({ id, userId, tokenHash, expiresAt, now }) {
      db.insert(authTokens).values({ id, userId, type: 'activation', tokenHash, expiresAt, createdAt: now }).run();
    },

    /**
     * Devuelve `{ id, email, status }` del Master (rol category='master'), o `null` si no hay master.
     * @returns {{ id: string, email: string, status: string }|null} Datos del Master o `null`.
     */
    findMaster() {
      const rows = db
        .select({ id: tenantUsers.id, email: tenantUsers.email, status: tenantUsers.status })
        .from(tenantUsers)
        .innerJoin(userRoles, eq(tenantUsers.id, userRoles.userId))
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(roles.category, 'master'), isNull(tenantUsers.deletedAt)))
        .limit(1)
        .all();
      return rows[0] ?? null;
    },

    /**
     * Invalida (elimina) los tokens de activación previos de un usuario. El link viejo deja de servir.
     * @param {Object} params - Parámetros de invalidación.
     * @param {string} params.userId - ID del usuario cuyos tokens se eliminan.
     */
    deleteActivationTokens({ userId }) {
      db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.type, 'activation'))).run();
    },
  };
}
