import { z } from 'zod';

// Serializadores estrictos (Zod `strip`) para las respuestas del CRUD dinámico de tenant-data.
// El shape del record depende del contrato del tenant, así que usamos `passthrough` para no
// filtrar campos legítimos definidos por el Superadmin; el filtrado real de "sensibles" queda a
// nivel de repositorio (Neon/Mongo adapters exponen exactamente lo que la resource declara).
//
// Este archivo blinda solo la envolvente y los campos de auditoría; jamás debe filtrar por
// accidente hashes u otros secretos porque el store de tenant-data JAMÁS almacena secretos —
// los proveedores/credenciales viven cifrados en `tenant_providers` y nunca tocan el CRUD.

const timestampSchema = z.union([z.number(), z.string()]).transform((val) => Number(val)).optional();

/**
 * Respuesta de creación: la fila insertada. `id` UUIDv7 lo inyecta el adapter.
 * @typedef {Object} InsertRecordResult
 * @property {string} id
 * @property {number} created_at
 * @property {number} updated_at
 */
export const insertRecordResultSchema = z.object({
  id: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}).passthrough();

/**
 * Respuesta de actualización: la fila actualizada (misma forma que insert).
 * @typedef {InsertRecordResult} UpdateRecordResult
 */
export const updateRecordResultSchema = insertRecordResultSchema;

/**
 * Respuesta de borrado lógico: id + flag.
 * @typedef {Object} DeleteRecordResult
 * @property {string} id
 * @property {boolean} deleted
 */
export const deleteRecordResultSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
});
