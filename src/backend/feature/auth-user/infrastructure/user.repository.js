import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { uuidv7 } from '../../../common/id.js';
import { tenantUsers, roles, userRoles, authTokens } from '../../../config/drizzle/schema-tenant.js';

/**
 * Repositorio de end-users del tenant. Opera exclusivamente sobre `<tenantId>.db` (tenant_users +
 * roles + user_roles). Nunca toca `platform.db` — ese es dominio del Superadmin. Ver auth-user.md.
 *
 * @param {Object} deps - Dependencias del repositorio.
 * @param {import('drizzle-orm').DrizzleD1Database} deps.db - Conexión Drizzle a la base de datos del tenant.
 * @returns {UserRepository} Objeto con métodos de acceso a datos de usuarios del tenant.
 * @example
 * const userRepo = createUserRepository({ db: tenantDb });
 * const user = userRepo.findByEmail('user@example.com');
 */
export function createUserRepository({ db }) {
  return {
    /**
     * Busca un usuario por email (case-sensitive; normalizar fuera).
     * Excluye usuarios soft-deleted.
     * @param {string} email - Correo del usuario a buscar.
     * @returns {Object|null} Fila del usuario o `null` si no existe o está borrado.
     */
    findByEmail(email) {
      return db
        .select()
        .from(tenantUsers)
        .where(and(eq(tenantUsers.email, email), isNull(tenantUsers.deletedAt)))
        .limit(1)
        .all()[0] ?? null;
    },

    /**
     * Busca un rol del tenant por su nombre.
     * @param {string} name - Nombre del rol (ej: 'user').
     * @returns {Object|null} Fila del rol o `null` si no existe.
     */
    findUserRoleByName(name) {
      return db.select().from(roles).where(eq(roles.name, name)).limit(1).all()[0] ?? null;
    },

    /**
     * Crea un nuevo rol en el tenant (auto-provisioning del rol `user`).
     * @param {Object} params - Datos del rol.
     * @param {string} params.name - Nombre del rol.
     * @param {string} params.category - Categoría del rol (ej: 'user').
     * @param {number} params.now - Timestamp de creación en ms.
     * @returns {{ id: string }} Objeto con el ID del rol creado.
     */
    createUserRole({ name, category, now }) {
      const id = uuidv7();
      db.insert(roles).values({ id, name, category, isReserved: 0, createdAt: now, updatedAt: now }).run();
      return { id };
    },

    /**
     * Inserta un nuevo end-user en el tenant.
     * @param {Object} params - Datos del usuario.
     * @param {string} params.id - ID único del usuario.
     * @param {string} params.email - Correo del usuario.
     * @param {string} params.passwordHash - Hash de la contraseña.
     * @param {'local'|'google'|string} params.authProvider - Proveedor de autenticación.
     * @param {'active'|'invited'|'suspended'} params.status - Estado inicial del usuario.
     * @param {number} params.now - Timestamp de creación en ms.
     */
    insertUser({ id, email, passwordHash, authProvider, status, now }) {
      db.insert(tenantUsers)
        .values({ id, email, passwordHash, authProvider, status, createdAt: now, updatedAt: now })
        .run();
    },

    /**
     * Busca un usuario OAuth por proveedor y su ID en el proveedor externo.
     * @param {Object} params - Parámetros de búsqueda.
     * @param {string} params.authProvider - Nombre del proveedor OAuth.
     * @param {string} params.providerUserId - ID del usuario en el proveedor externo.
     * @returns {Object|null} Fila del usuario o `null` si no existe.
     */
    findByProvider({ authProvider, providerUserId }) {
      return db
        .select()
        .from(tenantUsers)
        .where(and(
          eq(tenantUsers.authProvider, authProvider),
          eq(tenantUsers.providerUserId, providerUserId),
          isNull(tenantUsers.deletedAt),
        ))
        .limit(1)
        .all()[0] ?? null;
    },

    /**
     * Inserta un end-user autenticado por OAuth. `password_hash` queda `null` (no puede hacer login
     * local sin pasar por reset-pass primero — se decidirá en Fase 5 slice 4). `provider_user_id`
     * es único por `auth_provider` (índice `uq_tenant_users_provider` del schema).
     * @param {Object} params - Datos del usuario OAuth.
     * @param {string} params.id - ID único del usuario.
     * @param {string} params.email - Correo del usuario.
     * @param {string} params.authProvider - Nombre del proveedor OAuth.
     * @param {string} params.providerUserId - ID del usuario en el proveedor externo.
     * @param {'active'|'suspended'} params.status - Estado inicial del usuario.
     * @param {number} params.now - Timestamp de creación en ms.
     */
    insertOAuthUser({ id, email, authProvider, providerUserId, status, now }) {
      db.insert(tenantUsers)
        .values({ id, email, authProvider, providerUserId, status, createdAt: now, updatedAt: now })
        .run();
    },

    /**
     * Asigna un rol a un usuario (idempotente por PK compuesta).
     * @param {Object} params - Datos de la asignación.
     * @param {string} params.userId - ID del usuario.
     * @param {string} params.roleId - ID del rol.
     * @param {number} params.now - Timestamp de asignación en ms.
     */
    assignRole({ userId, roleId, now }) {
      db.insert(userRoles).values({ userId, roleId, assignedAt: now }).onConflictDoNothing().run();
    },

    /**
     * Persiste un token de restablecimiento de contraseña con su hash SHA-256.
     * @param {Object} params - Datos del token.
     * @param {string} params.id - ID único del token.
     * @param {string} params.userId - ID del usuario asociado.
     * @param {string} params.tokenHash - Hash SHA-256 del token crudo.
     * @param {number} params.expiresAt - Timestamp de expiración en ms.
     * @param {number} params.now - Timestamp de creación en ms.
     */
    insertPasswordResetToken({ id, userId, tokenHash, expiresAt, now }) {
      db.insert(authTokens)
        .values({ id, userId, type: 'password_reset', tokenHash, expiresAt, createdAt: now })
        .run();
    },

    /**
     * Busca un token de restablecimiento de contraseña válido por su hash SHA-256.
     * @param {Object} params - Parámetros de búsqueda.
     * @param {string} params.tokenHash - Hash SHA-256 del token.
     * @param {number} params.now - Timestamp actual en ms para validar expiración.
     * @returns {{ id: string, userId: string }|null} Objeto con id y userId del token, o `null`.
     */
    findValidResetToken({ tokenHash, now }) {
      const row = db
        .select({ id: authTokens.id, userId: authTokens.userId })
        .from(authTokens)
        .where(and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.type, 'password_reset'),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, now),
        ))
        .limit(1)
        .all()[0];
      return row ?? null;
    },

    /**
     * Marca un token como consumido para prevenir ataques de replay.
     * @param {Object} params - Parámetros de la operación.
     * @param {string} params.tokenId - ID del token a marcar.
     * @param {number} params.now - Timestamp de consumo en ms.
     */
    markTokenUsed({ tokenId, now }) {
      db.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, tokenId)).run();
    },

    /**
     * Actualiza el hash de contraseña de un usuario. Si el usuario tenía OAuth (auth_provider != 'local'),
     * también migra el authProvider a 'local' para permitir login por password — preserva
     * `provider_user_id` por si se requiere vinculación futura.
     * @param {Object} params - Parámetros de actualización.
     * @param {string} params.userId - ID del usuario.
     * @param {string} params.passwordHash - Nuevo hash de contraseña.
     * @param {number} params.now - Timestamp de actualización en ms.
     */
    updatePassword({ userId, passwordHash, now }) {
      db.update(tenantUsers)
        .set({ passwordHash, authProvider: 'local', updatedAt: now })
        .where(eq(tenantUsers.id, userId))
        .run();
    },
  };
}
