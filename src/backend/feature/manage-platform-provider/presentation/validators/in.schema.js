import { z } from 'zod';
import { coerceBoolean } from '../../../../common/validators.js';
import { PROVIDER_CATEGORIES } from '../../../../infrastructure/providers/registry.js';

// P8.5: el enum de categorías se DERIVA del registry — fuente única. Agregar 'mail' o 'payments'
// pasa por agregar entradas al registry (más extender el CHECK del schema Drizzle en migración).
// Sin este derivación, cada nueva categoría requería tocar 2 archivos duplicando el enum.
const categorySchema = z.enum(PROVIDER_CATEGORIES);

/**
 * Esquema Zod para linkear un proveedor al tenant: categoría + nombre + su config (p.ej. `{ uri }`).
 * @typedef {Object} LinkProviderInput
 * @property {string} category - Categoría del proveedor (derivada del registry).
 * @property {string} provider - Nombre del proveedor.
 * @property {Object} [config] - Configuración de conexión.
 */
export const linkProviderSchema = z.object({
  category: categorySchema,
  provider: z.string().min(1),
  // P6a: el provider `local` (auth tradicional) no tiene environments — config vacía.
  config: z.record(z.string(), z.any()).optional().default({}),
});

/**
 * P6a: esquema Zod para los parámetros de ruta al deslinkear un proveedor.
 * @typedef {Object} UnlinkProviderParams
 * @property {string} tenantId - ID del tenant.
 * @property {string} category - Categoría del proveedor.
 * @property {string} provider - Nombre del proveedor.
 */
export const unlinkProviderParamsSchema = z.object({
  tenantId: z.string().min(1),
  category: categorySchema,
  provider: z.string().min(1),
});

/**
 * Esquema Zod para el body opcional del DELETE /providers/:category/:provider.
 * `force=true` acepta deslinkear un provider que el DRAFT en curso usa (deja los resources/strategies
 * afectados huérfanos — el operador debe resolverlos antes de publicar). No aplica al contrato
 * publicado (hard block).
 * @typedef {Object} UnlinkProviderBody
 * @property {boolean} [force=false] - Si es `true`, salta la protección del draft en curso.
 */
export const unlinkProviderBodySchema = z.object({
  force: coerceBoolean.optional().default(false),
});

/**
 * P8.4b: Esquema Zod para el body del PUT /providers/:category/:provider/settings — settings
 * anidados en JSON. Cada key es validada contra `desc.settings.fields` del registry por el use
 * case (fail-loud si es unknown). Acá sólo garantizamos que sea un objeto plano.
 * @typedef {Object} UpdateProviderSettingsInput
 * @property {Object} settings - Mapa de settings a actualizar.
 */
export const updateProviderSettingsSchema = z.object({
  settings: z.record(z.string(), z.any()),
});
