import { z } from 'zod';
import { idParam } from '../../../../common/validators.js';

// Validador de params de ruta del CRUD dinámico. El body no se valida acá — su forma sale del
// contrato publicado del tenant y la valida el use case con `compileResourceSchema`.

/**
 * Parámetro `:resource` en las rutas `/api-system/v1/data/:resource*`.
 * @typedef {Object} ResourceParam
 * @property {string} resource - Nombre del resource.
 */
export const resourceParamSchema = idParam('resource');

/**
 * Parámetros de ruta para operaciones sobre un record concreto (`:resource/:id`).
 * @typedef {Object} RecordParam
 * @property {string} resource - Nombre del resource.
 * @property {string} id - ID del registro.
 */
export const recordParamSchema = z.object({
  resource: z.string().min(1),
  id: z.string().min(1),
});
