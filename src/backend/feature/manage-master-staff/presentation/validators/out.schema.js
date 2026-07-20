/**
 * Schemas Zod de serialización de salida para respuestas de manage-master-staff.
 * Blindan la respuesta: jamás viajan hashes, tokens de invitación crudos ni deletedAt.
 * @module out.schema
 */

import { z } from 'zod';

/**
 * Schema de serialización para respuesta de invitación de Staff.
 * Solo contiene el userId del colaborador creado.
 * @typedef {Object} InviteStaffResult
 * @property {string} userId - ID del colaborador creado.
 */
export const inviteStaffResultSchema = z.object({
  userId: z.string().min(1),
});

/**
 * Schema de serialización de un elemento de la lista de colaboradores.
 * Incluye id, email, status y array de nombres de roles asignados.
 * @typedef {Object} StaffMemberDTO
 * @property {string} id - ID del colaborador.
 * @property {string} email - Correo electrónico.
 * @property {'invited'|'active'|'suspended'} status - Estado de la cuenta.
 * @property {string[]} roles - Nombres de los roles asignados.
 */
export const staffMemberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  status: z.enum(['invited', 'active', 'suspended']),
  roles: z.array(z.string()),
});

/**
 * Schema de serialización de la lista paginada de colaboradores.
 * Respuesta de `GET /api-system/v1/staff`.
 * @typedef {Object} StaffListResult
 * @property {StaffMemberDTO[]} data - Colaboradores de la página actual.
 * @property {{ limit: number, offset: number, count: number }} pagination - Metadatos de paginación.
 */
export const staffListSchema = z.object({
  data: z.array(staffMemberSchema),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    count: z.number(),
  }),
});
