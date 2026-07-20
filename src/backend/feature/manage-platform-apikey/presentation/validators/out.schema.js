/**
 * Schemas Zod de serialización de salida para respuestas de manage-platform-apikey.
 * @module out.schema
 */

import { z } from 'zod';

/**
 * Schema de serialización para respuesta de emisión de API key "frontend".
 * El valor crudo (`apiKey`) viaja SOLO en esta respuesta; nunca se persiste.
 */
export const apiKeyGeneratedSchema = z.object({
  id: z.string(),
  apiKey: z.string(),
  createdAt: z.number(),
  regenerated: z.boolean(),
});

/**
 * Schema de serialización para el estado de la API key (columna Keys del listado).
 * Jamás incluye el valor crudo ni el hash.
 */
export const apiKeyStatusSchema = z.object({
  exists: z.boolean(),
  id: z.string().optional(),
  createdAt: z.number().optional(),
  lastUsedAt: z.number().nullable().optional(),
});
