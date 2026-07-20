import { z } from 'zod';

/**
 * Metadatos serializados de un asset — SIN nunca exponer credenciales del provider.
 * @typedef {Object} AssetDTO
 * @property {string} id
 * @property {'cloudinary'|'box'} provider
 * @property {string} publicId
 * @property {string} url
 * @property {number} bytes
 * @property {string|null} [format]
 * @property {string|null} [mimeType]
 * @property {string|null} [filename]
 * @property {string|null} [resourceName]
 * @property {string|null} [fieldName]
 * @property {string|null} [rowId]
 * @property {string|null} [uploadedBy]
 * @property {number} uploadedAt
 */
export const assetSchema = z.object({
  id: z.string(),
  provider: z.enum(['cloudinary', 'box']),
  publicId: z.string(),
  url: z.string(),
  bytes: z.number().int().nonnegative(),
  format: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  resourceName: z.string().nullable().optional(),
  fieldName: z.string().nullable().optional(),
  rowId: z.string().nullable().optional(),
  uploadedBy: z.string().nullable().optional(),
  uploadedAt: z.number().int(),
});

/**
 * Meta de paginación (shape de `common/pagination.js.buildPageMeta`).
 * @typedef {Object} PageMeta
 * @property {number} page
 * @property {number} limit
 * @property {number} total
 * @property {number} totalPages
 * @property {boolean} hasNext
 * @property {boolean} hasPrev
 */
export const pageMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

/**
 * Resultado del listado paginado de assets.
 * @typedef {Object} ListAssetsResult
 * @property {AssetDTO[]} data
 * @property {PageMeta} meta
 */
export const listAssetsResultSchema = z.object({
  data: z.array(assetSchema),
  meta: pageMetaSchema,
});

/**
 * Resultado del delete de un asset.
 * @typedef {Object} DeleteAssetResult
 * @property {string} id
 * @property {boolean} deleted
 */
export const deleteAssetResultSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
});
