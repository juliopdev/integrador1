import { z } from 'zod';

const VERB = z.enum(['GET', 'POST', 'PUT', 'DELETE']);

/**
 * Esquema Zod para crear un rol de Staff: nombre + matriz de permisos
 * `{ version: { endpoint: [verbos] } }`.
 * @typedef {Object} CreateRoleInput
 * @property {string} name - Nombre del rol (snake_case, mínimo 2 caracteres).
 * @property {Object.<string, Object.<string, Array<'GET'|'POST'|'PUT'|'DELETE'>>>} [permissions]
 *   - Matriz de permisos por versión de contrato.
 */
export const createRoleSchema = z.object({
  name: z.string().min(2),
  permissions: z.record(z.string(), z.record(z.string(), z.array(VERB))).default({}),
});
