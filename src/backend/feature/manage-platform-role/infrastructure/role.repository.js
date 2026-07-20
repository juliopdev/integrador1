import { and, eq } from 'drizzle-orm';
import { roles, userRoles } from '../../../config/drizzle/schema-tenant.js';

/**
 * Fábrica para el repositorio de roles del tenant (`roles`). Los **crea el Superadmin** durante
 * el asistente; el Master solo los asigna. Recibe la conexión del tenant elegido.
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.db - Instancia de Drizzle conectada a la base SQLite del tenant.
 * @returns {{
 *   findByName: (name: string) => (Object|null),
 *   insert: (params: { id: string, name: string, category: string, isReserved: number, permissionsJson: string, now: number }) => void,
 *   list: () => Array<Object>,
 *   deleteById: (id: string) => void,
 *   updatePermissions: (params: { id: string, permissionsJson: string, now: number }) => void,
 *   listRoleNamesForUser: (userId: string) => Array<string>,
 *   listStaff: () => Array<{ id: string, name: string }>,
 * }}
 */
export function createRoleRepository({ db }) {
  return {
    /**
     * Busca un rol por su nombre exacto.
     * @param {string} name - Nombre del rol.
     * @returns {Object|null} Rol encontrado o `null`.
     */
    findByName(name) {
      return db.select().from(roles).where(eq(roles.name, name)).limit(1).all()[0] ?? null;
    },
    /**
     * Inserta un nuevo rol en la base de datos del tenant.
     * @param {Object} params - Datos del rol.
     * @param {string} params.id - ID único del rol.
     * @param {string} params.name - Nombre del rol.
     * @param {string} params.category - Categoría del rol.
     * @param {number} params.isReserved - 1 si es reservado, 0 si no.
     * @param {string} params.permissionsJson - Permisos en JSON string.
     * @param {number} params.now - Timestamp de creación (ms).
     */
    insert({ id, name, category, isReserved, permissionsJson, now }) {
      db.insert(roles).values({ id, name, category, isReserved, permissionsJson, createdAt: now, updatedAt: now }).run();
    },
    /**
     * Lista todos los roles del tenant.
     * @returns {Array<Object>} Lista de roles.
     */
    list() {
      return db.select().from(roles).all();
    },

    /**
     * P7.2: elimina un rol por su ID (el use case valida staff no-reservado antes).
     * @param {string} id - ID del rol a eliminar.
     */
    deleteById(id) {
      db.delete(roles).where(eq(roles.id, id)).run();
    },

    /**
     * P6b: reemplaza el `permissions_json` completo del rol (compilado desde `endpoints[].access`).
     * @param {Object} params - Parámetros de actualización.
     * @param {string} params.id - ID del rol.
     * @param {string} params.permissionsJson - Nuevos permisos en JSON string.
     * @param {number} params.now - Timestamp de la operación (ms).
     */
    updatePermissions({ id, permissionsJson, now }) {
      db.update(roles).set({ permissionsJson, updatedAt: now }).where(eq(roles.id, id)).run();
    },

    /**
     * P6b: retorna los nombres de roles asignados a un usuario (N:M `user_roles`) —
     * audiencias Staff del dispatcher.
     * @param {string} userId - ID del usuario.
     * @returns {Array<string>} Lista de nombres de roles.
     */
    listRoleNamesForUser(userId) {
      return db
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId))
        .all()
        .map((r) => r.name);
    },

    /**
     * Proyección para el asistente No-Code: solo roles de categoría `staff` no reservados
     * (`master`/`support` son del sistema). No expone `permissionsJson`.
     * @returns {Array<{ id: string, name: string }>} Lista reducida de roles staff.
     */
    listStaff() {
      return db
        .select({ id: roles.id, name: roles.name })
        .from(roles)
        .where(and(eq(roles.category, 'staff'), eq(roles.isReserved, 0)))
        .all();
    },
  };
}
