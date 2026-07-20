import { z } from 'zod';

/**
 * Esquema Zod de serialización para el resultado de deslinkear un proveedor.
 * @typedef {Object} UnlinkProviderResult
 * @property {string} provider - Nombre del proveedor.
 * @property {string} category - Categoría del proveedor.
 * @property {boolean} unlinked - `true` si se deslinkeó correctamente.
 */
export const unlinkProviderResultSchema = z.object({
  provider: z.string(),
  category: z.string(),
  unlinked: z.boolean(),
});
