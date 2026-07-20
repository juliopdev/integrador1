import { and, eq, isNull } from 'drizzle-orm';
import { roles, tenantUsers, userRoles, authTokens } from '../../../config/drizzle/schema-tenant.js';

/**
 * Fábrica del repositorio de gestión de Staff dentro del `tenant.db` del request (`db`).
 * Lee/escribe usuarios, asignaciones de rol y tokens de invitación. Ver manage-master-staff.md.
 *
 * @param {Object} deps - Dependencias del repositorio.
 * @param {import('drizzle-orm').DrizzleD1Database} deps.db - Conexión Drizzle a la base de datos del tenant.
 * @returns {StaffRepository} Objeto con métodos de acceso a datos de staff.
 * @example
 * const staffRepo = createStaffRepository({ db: tenantDb });
 * const role = staffRepo.findRoleById('role_abc');
 */
export function createStaffRepository({ db }) {
  return {
    /**
     * Busca un rol por su ID.
     * @param {string} id - ID del rol.
     * @returns {Object|null} Fila del rol o `null` si no existe.
     */
    findRoleById(id) {
      return db.select().from(roles).where(eq(roles.id, id)).limit(1).all()[0] ?? null;
    },
    /**
     * Busca un colaborador por su ID (excluye soft-deleted).
     * @param {string} id - ID del usuario.
     * @returns {Object|null} Fila del usuario o `null` si no existe o está borrado.
     */
    findUserById(id) {
      return db.select().from(tenantUsers).where(and(eq(tenantUsers.id, id), isNull(tenantUsers.deletedAt))).limit(1).all()[0] ?? null;
    },
    /**
     * Busca un colaborador por email (excluye soft-deleted).
     * @param {string} email - Correo del usuario.
     * @returns {Object|null} Fila del usuario o `null` si no existe.
     */
    findUserByEmail(email) {
      return db
        .select()
        .from(tenantUsers)
        .where(and(eq(tenantUsers.email, email), isNull(tenantUsers.deletedAt)))
        .limit(1)
        .all()[0] ?? null;
    },
    /**
     * Inserta un nuevo colaborador en el tenant.
     * @param {Object} params - Datos del usuario.
     * @param {string} params.id - ID único del usuario.
     * @param {string} params.email - Correo del usuario.
     * @param {string} params.status - Estado inicial (ej: 'invited').
     * @param {number} params.now - Timestamp de creación en ms.
     */
    insertUser({ id, email, status, now }) {
      db.insert(tenantUsers).values({ id, email, status, createdAt: now, updatedAt: now }).run();
    },
    /**
     * Marca un colaborador como eliminado (soft-delete).
     * @param {Object} params - Parámetros de la operación.
     * @param {string} params.userId - ID del usuario a eliminar.
     * @param {number} params.now - Timestamp de eliminación en ms.
     */
    softDeleteUser({ userId, now }) {
      db.update(tenantUsers).set({ deletedAt: now, updatedAt: now }).where(eq(tenantUsers.id, userId)).run();
    },
    /**
     * Asigna un rol a un colaborador (idempotente: ignora si ya lo tenía).
     * @param {Object} params - Datos de la asignación.
     * @param {string} params.userId - ID del usuario.
     * @param {string} params.roleId - ID del rol.
     * @param {number} params.now - Timestamp de asignación en ms.
     */
    assignRole({ userId, roleId, now }) {
      db.insert(userRoles).values({ userId, roleId, assignedAt: now }).onConflictDoNothing().run();
    },
    /**
     * Revoca un rol de un colaborador.
     * @param {Object} params - Parámetros de la operación.
     * @param {string} params.userId - ID del usuario.
     * @param {string} params.roleId - ID del rol a revocar.
     */
    revokeRole({ userId, roleId }) {
      db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId))).run();
    },
    /**
     * Persiste un token de invitación con su hash SHA-256.
     * @param {Object} params - Datos del token.
     * @param {string} params.id - ID único del token.
     * @param {string} params.userId - ID del usuario invitado.
     * @param {string} params.tokenHash - Hash SHA-256 del token crudo.
     * @param {number} params.expiresAt - Timestamp de expiración en ms.
     * @param {number} params.now - Timestamp de creación en ms.
     */
    insertInvitationToken({ id, userId, tokenHash, expiresAt, now }) {
      db.insert(authTokens).values({ id, userId, type: 'invitation', tokenHash, expiresAt, createdAt: now }).run();
    },
    /**
     * Lista colaboradores activos (no soft-deleted) con sus roles.
     * @param {Object} [params] - Parámetros de paginación.
     * @param {number} [params.limit=20] - Cantidad máxima de resultados.
     * @param {number} [params.offset=0] - Desplazamiento para paginación.
     * @returns {Array<{ id: string, email: string, status: string, roles: Array<string> }>}
     */
    listStaffWithRoles({ limit = 20, offset = 0 } = {}) {
      const rows = db
        .select({ id: tenantUsers.id, email: tenantUsers.email, status: tenantUsers.status, roleName: roles.name })
        .from(tenantUsers)
        .innerJoin(userRoles, eq(userRoles.userId, tenantUsers.id))
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(eq(roles.category, 'staff'), isNull(tenantUsers.deletedAt)))
        .limit(limit)
        .offset(offset)
        .all();
      const byUser = new Map();
      for (const r of rows) {
        if (!byUser.has(r.id)) byUser.set(r.id, { id: r.id, email: r.email, status: r.status, roles: [] });
        byUser.get(r.id).roles.push(r.roleName);
      }
      return [...byUser.values()];
    },
    /**
     * Obtiene todos los roles del tenant (para el selector de asignación en la vista de Staff).
     * @returns {Array<Object>} Array de filas de roles.
     */
    listAllRoles() {
      return db.select().from(roles).all();
    },
  };
}
