/**
 * Schemas Zod de serialización de salida para respuestas de manage-platform-backend.
 * Garantizan que las respuestas al Superadmin solo contengan campos previstos.
 * @module out.schema
 */

import { z } from 'zod';

const backendListItemSchema = z.object({
  version: z.string(),
  status: z.string(),
  publishedAt: z.number().nullable().optional(),
});

/** Listado de backends: solo metadatos, nunca el `schema_json` completo. */
export const backendListSchema = z.array(backendListItemSchema);

const contractShapeSchema = z
  .object({
    version: z.string(),
    stores: z.record(z.string(), z.object({ provider: z.string(), enabled: z.boolean() })),
    resources: z.array(z.any()),
    endpoints: z.array(z.any()),
    auth: z.object({
      userAuthEnabled: z.boolean(),
      strategies: z.array(z.string()).default([]),
      redirectUris: z.array(z.string()).default([]),
    }),
    websocket: z.object({ channels: z.array(z.string()).default([]) }).optional(),
  })
  .strip();

/** Detalle de un backend: nunca expone credenciales del proveedor (viven en `tenant_providers`). */
export const backendDetailSchema = z.object({
  version: z.string(),
  status: z.string(),
  schema: contractShapeSchema,
});

/** Publicación de contrato: solo la versión activada. */
export const publishResultSchema = z.object({ version: z.string() });

// `createRoleResultSchema` movido a `manage-platform-role/presentation/validators/out.schema.js`.

/** Toggle de API Auth: estado resultante. */
export const toggleAuthResultSchema = z.object({
  userAuthEnabled: z.boolean(),
});

/** Toggle de canal WS: canal + estado. */
export const toggleWsResultSchema = z.object({
  channel: z.string(),
  enabled: z.boolean(),
});

/** Resumen del draft tras una mutación (agregar/quitar resource/field/endpoint). */
export const draftSummarySchema = z.object({
  version: z.string(),
  resources: z.array(z.string()),
});

/** Resumen del resource del draft tras una mutación de sus fields. */
export const draftResourceSummarySchema = z.object({
  resourceName: z.string(),
  fields: z.array(z.string()),
});

/** Resumen del draft tras una mutación de endpoints. */
export const draftEndpointsSummarySchema = z.object({
  endpoints: z.array(z.object({ path: z.string(), methods: z.array(z.string()) })),
});

/** Estado de la sección `auth` del draft tras la mutación. */
export const draftAuthSummarySchema = z.object({
  userAuthEnabled: z.boolean(),
  strategies: z.array(z.string()),
  redirectUris: z.array(z.string()),
});

export { serialize } from '../../../../common/responses.js';

/** P4: emisión de la API key "frontend" — el valor crudo viaja SOLO en esta respuesta. */
export const apiKeyGeneratedSchema = z.object({
  id: z.string(),
  apiKey: z.string(),
  createdAt: z.number(),
  regenerated: z.boolean(),
});

/** P4: estado de la key (columna Keys del listado) — jamás incluye el valor ni el hash. */
export const apiKeyStatusSchema = z.object({
  exists: z.boolean(),
  id: z.string().optional(),
  createdAt: z.number().optional(),
  lastUsedAt: z.number().nullable().optional(),
});

/** P7: resultado de iniciar el borrador (paso 1 v2). */
export const draftStartResultSchema = z.object({
  version: z.string(),
  mode: z.enum(['edit', 'upgrade']),
  existing: z.boolean(),
});

// `unlinkProviderResultSchema` movido a `manage-platform-provider/presentation/validators/out.schema.js`.

/** Eliminar versión del historial. */
export const deleteVersionResultSchema = z.object({
  deleted: z.boolean(),
  version: z.string(),
});

// `deleteRoleResultSchema` movido a `manage-platform-role/presentation/validators/out.schema.js`.

/** Abortar/descartar draft. `restored` = entradas de `tenant_providers` afectadas por el restore
 * (upserts desde el snapshot + deshabilitados que se linkearon durante el draft). Cero en la ruta
 * post-publish (esa no restaura). */
export const deleteDraftResultSchema = z.object({
  deleted: z.boolean(),
  restored: z.number().int().nonnegative().default(0),
});
