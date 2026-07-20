/**
 * Schemas Zod de validación de entrada para las rutas API de manage-master-staff.
 * @module in.schema
 */

import { z } from 'zod';
import { idParam } from '../../../../common/validators.js';

/**
 * Schema de validación para invitación de Staff.
 * Requiere email del invitado y ID de un rol existente de categoría staff.
 * @typedef {Object} InviteStaffInput
 * @property {string} email - Correo electrónico del invitado.
 * @property {string} roleId - ID del rol de categoría staff a asignar.
 */
export const inviteStaffSchema = z.object({
  email: z.string().email(),
  roleId: z.string().min(1),
});

/**
 * Schema de validación para asignar o revocar un rol a un colaborador.
 * @typedef {Object} UpdateStaffRoleInput
 * @property {string} roleId - ID del rol a modificar.
 * @property {'assign'|'revoke'} action - Acción a realizar sobre el rol.
 */
export const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  action: z.enum(['assign', 'revoke']),
});

/**
 * Schema de validación para parámetros de ruta en operaciones sobre un colaborador.
 * Extrae el `userId` como parámetro obligatorio.
 * @typedef {Object} StaffUserParam
 * @property {string} userId - ID del colaborador.
 */
export const staffUserParamSchema = idParam('userId');

/**
 * Schema de validación para query params de listado paginado de staff.
 * `limit` (1-100, default 20) y `offset` (≥0, default 0).
 * @typedef {Object} StaffListQuery
 * @property {number} [limit=20] - Registros por página (1-100).
 * @property {number} [offset=0] - Desplazamiento.
 */
export const staffListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
