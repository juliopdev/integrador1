/**
 * Schemas Zod de validación de entrada para las rutas de manage-platform-frontend.
 * @module in.schema
 */

import { z } from 'zod';

/** Schema para el parámetro de ruta `:tenantId`. */
export const tenantIdParamSchema = z.object({
  tenantId: z.string().min(1),
});

/**
 * Body para setear el redirect externo. La validación semántica (https, sin puerto) vive en el
 * use case — el schema HTTP sólo asegura presencia y forma mínima.
 * @typedef {Object} SetExternalSchema
 * @property {string} externalUrl - URL externa de destino.
 */
export const setExternalSchema = z.object({
  externalUrl: z.string().min(1).max(2000),
});
