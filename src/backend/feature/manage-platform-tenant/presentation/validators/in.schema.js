import { z } from 'zod';
import { idParam } from '../../../../common/validators.js';

/**
 * Esquema Zod para el alta de tenant: subdominio (validación de formato fina la hace el caso de uso)
 * + email del Master. P2: `projectName` (nombre visible de la web del tenant; default = subdomain)
 * y `planId` (contrato referencial; default = plan `basic`) — la UI los exige, la API defaultea.
 *
 * @typedef {Object} CreateTenantInput
 * @property {string} subdomain - Subdominio deseado.
 * @property {string} masterEmail - Correo electrónico del Master.
 * @property {string} [projectName] - Nombre visible del proyecto.
 * @property {string} [planId] - ID del plan (default: `basic`).
 */
export const createTenantSchema = z.object({
  subdomain: z.string().min(1),
  masterEmail: z.string().email(),
  projectName: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().trim().min(1).max(80).optional(),
  ),
  planId: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().min(1).optional(),
  ),
});

/**
 * Esquema Zod para el parámetro de ruta `id` del tenant.
 * @typedef {Object} TenantIdParam
 * @property {string} id - ID del tenant.
 */
export const tenantIdParamSchema = idParam('id');

/**
 * Esquema Zod para la edición de un tenant existente. Sólo `projectName` (nombre visible).
 * El subdominio es inmutable tras el alta (identidad física: redirects del contrato, cookies
 * de sesión, caché) → no editable.
 *
 * @typedef {Object} UpdateTenantInput
 * @property {string} projectName - Nuevo nombre del proyecto (1–80 caracteres).
 */
export const updateTenantSchema = z.object({
  projectName: z.string().trim().min(1, 'El nombre del proyecto es requerido.').max(80, 'Máximo 80 caracteres.'),
});

/**
 * Esquema Zod para el cambio de estado del tenant: el cliente DEBE enviar el estado destino
 * explícito. Rechaza el patrón "toggle" (susceptible de re-invertirse por reintentos de red /
 * doble click).
 *
 * @typedef {Object} SetTenantStatusInput
 * @property {'active'|'suspended'} desiredStatus - Estado destino.
 */
export const setTenantStatusSchema = z.object({
  desiredStatus: z.enum(['active', 'suspended']),
});

/**
 * Esquema Zod para la confirmación obligatoria de soft-delete: el subdominio del tenant debe
 * re-tipearse en el body. Cierra el vector CSRF/XSS donde bastaría el ID (visible en el listado)
 * para disparar un DELETE. La comparación case-insensitive vs `tenant.subdomain` la hace el
 * caso de uso.
 *
 * @typedef {Object} DeleteTenantInput
 * @property {string} confirmSubdomain - Subdominio del tenant a eliminar (confirmación).
 */
export const deleteTenantSchema = z.object({
  confirmSubdomain: z.string().min(1),
});
