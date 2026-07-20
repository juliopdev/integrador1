import { and, eq, gt, inArray, isNull } from 'drizzle-orm';

/**
 * Repositorio de credenciales administrativas. Genérico sobre las tablas de la base
 * según el contexto: platform (`platformUsers`/`authTokens` de platform.db) para el
 * Superadmin, o las de tenant.db para Master/Staff. Ver .doc/.../auth-admin.md.
 *
 * `activatesStatus`: si la tabla de usuarios tiene columna `status` (tenant_users), la activación
 * de credenciales también pasa el usuario a `'active'`. El Superadmin (platform_users) no tiene
 * `status`, así que se deja en `false`.
 *
 * `isActive(user)`: predicado para reset-pass. Superadmin no tiene columna `status` — se considera
 * activo cuando ya definió password (mismo criterio que `login`). Master/Staff exige `status='active'`.
 *
 * @param {Object} deps - Dependencias del repositorio.
 * @param {import('drizzle-orm').DrizzleD1Database} deps.db - Conexión Drizzle a la base de datos (platform.db o tenant.db).
 * @param {import('drizzle-orm').AnyTable} deps.users - Tabla de usuarios (platform_users o tenant_users).
 * @param {import('drizzle-orm').AnyTable} deps.authTokens - Tabla de tokens de autenticación.
 * @param {boolean} [deps.activatesStatus=false] - Si al activar credenciales debe actualizar el status del usuario a 'active'.
 * @param {(u: object) => boolean} [deps.isActive] - Predicado personalizado para determinar si un usuario está activo.
 * @returns {AdminRepository} Objeto con métodos de acceso a datos de administradores.
 * @example
 * const adminRepo = createAdminRepository({ db: platformDb, users: platformUsers, authTokens });
 * const user = adminRepo.findByEmail('admin@example.com');
 */
export function createAdminRepository({ db, users, authTokens, activatesStatus = false, isActive = (u) => Boolean(u.passwordHash) }) {
  return {
    /**
     * Busca un usuario administrativo por su email.
     * @param {string} email - Correo electrónico del administrador.
     * @returns {Object|null} Fila del usuario (incluye hashes y estado) o `null` si no existe o está soft-deleted.
     */
    findByEmail(email) {
      const rows = db.select().from(users).where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1).all();
      return rows[0] ?? null;
    },

    /**
     * Evalúa si un usuario administrativo está activo según el contexto.
     * Delega al predicado `isActive` inyectado en el constructor.
     * @param {Object} user - Fila del usuario a evaluar.
     * @returns {boolean} `true` si el usuario está activo.
     */
    isActive(user) {
      return isActive(user);
    },

    /**
     * Busca un token de activación/invitación válido por su hash SHA-256.
     * @param {string} tokenHash - Hash SHA-256 del token.
     * @param {number} now - Timestamp actual en ms para validar expiración.
     * @returns {Object|null} Fila del token o `null` si no existe, está usado o expiró.
     */
    findValidActivationToken(tokenHash, now) {
      const rows = db
        .select()
        .from(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, tokenHash),
            inArray(authTokens.type, ['activation', 'invitation']),
            isNull(authTokens.usedAt),
            gt(authTokens.expiresAt, now),
          ),
        )
        .limit(1)
        .all();
      return rows[0] ?? null;
    },

    /**
     * Define la contraseña y frase de acceso del administrador y consume el token de activación,
     * todo en una transacción atómica. Si `activatesStatus` está habilitado, también actualiza
     * el status del usuario a `'active'`.
     * @param {Object} params - Parámetros de la operación.
     * @param {string} params.userId - ID del usuario a activar.
     * @param {string} params.tokenId - ID del token a consumir.
     * @param {string} params.passwordHash - Hash de la nueva contraseña.
     * @param {string} params.passphraseHash - Hash de la nueva frase de acceso.
     * @param {number} params.now - Timestamp actual en ms.
     */
    setCredentialsAndConsumeToken({ userId, tokenId, passwordHash, passphraseHash, now }) {
      const fields = { passwordHash, passphraseHash, updatedAt: now };
      if (activatesStatus) fields.status = 'active'; // tenant_users: invited → active al activar
      db.transaction((tx) => {
        tx.update(users).set(fields).where(eq(users.id, userId)).run();
        tx.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, tokenId)).run();
      });
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
     * Actualiza exclusivamente el hash de la contraseña del administrador.
     * La frase de acceso (passphrase) no se modifica — es un doble factor persistente
     * cuyo restablecimiento requiere un flujo separado fuera del alcance de forgot-pass.
     * @param {Object} params - Parámetros de actualización.
     * @param {string} params.userId - ID del usuario.
     * @param {string} params.passwordHash - Nuevo hash de contraseña.
     * @param {number} params.now - Timestamp de actualización en ms.
     */
    updatePassword({ userId, passwordHash, now }) {
      db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, userId)).run();
    },
  };
}
