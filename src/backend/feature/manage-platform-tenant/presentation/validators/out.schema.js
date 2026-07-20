import { z } from 'zod';

// Serializadores estrictos de salida (Zod `strip`) para las rutas de aprovisionamiento de tenants.
// Blindan la respuesta: nunca se exponen tokens crudos (activación del Master), correos de admins
// no relacionados con el request ni credenciales cifradas. Ver .doc/rules/security.md.

/**
 * Esquema Zod de serialización para el resultado del alta de tenant: identificador + subdominio
 * activado (el token de bienvenida viaja por email).
 * @typedef {Object} CreateTenantResult
 * @property {string} tenantId - ID del tenant creado.
 * @property {string} subdomain - Subdominio asignado.
 */
export const createTenantResultSchema = z.object({
  tenantId: z.string().min(1),
  subdomain: z.string().min(1),
});

/**
 * Esquema Zod de serialización para el cambio de estado del tenant: solo el nuevo estado, sin
 * campos de auditoría internos.
 * @typedef {Object} SetTenantStatusResult
 * @property {string} id - ID del tenant.
 * @property {'pending'|'active'|'suspended'} status - Estado actual del tenant.
 */
export const setTenantStatusResultSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'active', 'suspended']),
});

/**
 * Esquema Zod de serialización para la edición de tenant: id + nombre visible actualizado.
 * @typedef {Object} UpdateTenantResult
 * @property {string} id - ID del tenant.
 * @property {string} projectName - Nombre del proyecto actualizado.
 */
export const updateTenantResultSchema = z.object({
  id: z.string(),
  projectName: z.string(),
});
