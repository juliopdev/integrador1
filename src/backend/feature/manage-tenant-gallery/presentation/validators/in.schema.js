import { z } from 'zod';

/**
 * Query params del listado paginado de la Biblioteca de medios. `parsePagination` reafirma
 * limit/page pero acepta strings para compatibilidad con query string HTTP.
 * @typedef {Object} ListAssetsQuery
 * @property {string|number} [page] - Número de página.
 * @property {string|number} [limit] - Registros por página.
 * @property {'cloudinary'|'box'} [provider] - Filtrar por proveedor.
 * @property {'image'|'video'|'audio'|'document'|Array<'image'|'video'|'audio'|'document'>} [type] - Familia MIME.
 */
export const listAssetsQuerySchema = z.object({
  page: z.union([z.string(), z.number()]).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  provider: z.enum(['cloudinary', 'box']).optional(),
  type: z.union([
    z.enum(['image', 'video', 'audio', 'document']),
    z.array(z.enum(['image', 'video', 'audio', 'document'])),
  ]).optional(),
});

/**
 * Path param del delete: id del asset (uuidv7).
 * @typedef {Object} AssetIdParam
 * @property {string} id - UUIDv7 del asset.
 */
export const assetIdParamSchema = z.object({ id: z.string().min(1) });
