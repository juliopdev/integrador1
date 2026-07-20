/**
 * Schemas Zod de serialización de salida para respuestas de manage-platform-frontend.
 * @module out.schema
 */

import { z } from 'zod';

/** @typedef {Object} DeployRow - Fila de deploy en el listado. */
export const deployRowSchema = z.object({
  tenantId: z.string(),
  subdomain: z.string(),
  tenantStatus: z.string(),
  deploy: z.object({
    id: z.string(),
    mode: z.enum(['hosted', 'external']),
    externalUrl: z.string().nullable(),
    status: z.enum(['active', 'disabled']),
    updatedAt: z.number(),
  }).nullable(),
});

/** Schema del listado completo de deploys. */
export const deployListSchema = z.array(deployRowSchema);

/** Schema de resultado al configurar redirect externo. */
export const setExternalResultSchema = z.object({
  tenantId: z.string(),
  mode: z.literal('external'),
  externalUrl: z.string(),
  status: z.enum(['active', 'disabled']),
  updatedAt: z.number(),
});

/** Schema de resultado al eliminar un deploy. */
export const deleteDeployResultSchema = z.object({
  tenantId: z.string(),
  deleted: z.boolean(),
});

/** Schema de resultado al desplegar frontend hospedado. */
export const setHostedResultSchema = z.object({
  tenantId: z.string(),
  mode: z.literal('hosted'),
  envVars: z.record(z.string()).optional(),
  extractedPath: z.string(),
  status: z.enum(['active', 'disabled']),
  updatedAt: z.number(),
});
