import { z } from 'zod';

/**
 * Esquema Zod de serialización para la creación de un rol: id + nombre canónico.
 * No expone la matriz de permisos original.
 * @typedef {Object} CreateRoleResult
 * @property {string} roleId - ID único del rol creado.
 * @property {string} name - Nombre canónico del rol.
 */
export const createRoleResultSchema = z.object({
  roleId: z.string(),
  name: z.string(),
});

/**
 * Esquema Zod de serialización para la eliminación de un rol de Staff.
 * @typedef {Object} DeleteRoleResult
 * @property {boolean} deleted - `true` si se eliminó correctamente.
 * @property {string} name - Nombre del rol eliminado.
 */
export const deleteRoleResultSchema = z.object({
  deleted: z.boolean(),
  name: z.string(),
});
