import { z } from 'zod';
import { coerceBoolean } from '../../common/validators.js';

// Compila una resource del contrato a un esquema Zod para validar el body en runtime (no-code.md).
// Validación de forma/tipo SÍNCRONA (safeParse, sin I/O); la existencia de `relation` la valida la BD
// vía FK. `.strict()` rechaza claves desconocidas para que el cliente no inyecte columnas/audit.

// Constructores de tipo en modo estricto: exigen el tipo nativo (uso desde APIs JSON `/api/:version/*`).
const TYPE_ZOD = {
  string: () => z.string(),
  text: () => z.string(),
  integer: () => z.number().int(),
  float: () => z.number(),
  boolean: () => z.boolean(),
  date: () => z.string(),         // ISO; afinable luego
  datetime: () => z.string(),
  json: () => z.unknown(),
  asset: () => z.string(),        // referencia/URL del asset
  relation: () => z.string(),     // id del recurso referenciado (existencia → FK en BD)
};

// Constructores en modo `coerce`: aceptan además strings desde `FormData` HTML. Solo se activa
// cuando el caller lo pide explícitamente (los submits del asistente/CRUD SSR), para no relajar
// las validaciones del dispatcher `/api/:version/*` que sí exige tipos nativos.
const TYPE_ZOD_COERCED = {
  ...TYPE_ZOD,
  integer: () => z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v), z.number().int()),
  float:   () => z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v), z.number()),
  boolean: () => coerceBoolean,
  json:    () => z.preprocess((v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } }, z.unknown()),
};

/**
 * Compila una resource del contrato a un esquema Zod para validar el body en runtime.
 * Excluye campos de auditoría (id, created_at, etc.) que inyecta el sistema.
 * En `partial` (update) todos los campos son opcionales.
 * Cuando `coerce` es `true`, los tipos numéricos/booleanos aceptan strings (útil para submits SSR).
 * `.strict()` rechaza claves desconocidas para evitar inyección de columnas.
 *
 * @param {object} resource - Resource del contrato (con `fields`).
 * @param {object} [opts] - Opciones de compilación.
 * @param {boolean} [opts.partial=false] - Si `true`, todos los campos son opcionales (para update).
 * @param {boolean} [opts.coerce=false] - Si `true`, los tipos numéricos/booleanos aceptan strings (FormData HTML).
 * @returns {import('zod').ZodObject} Esquema Zod con `.strict()` para validación del body.
 * @example
 * compileResourceSchema({ fields: [{ name: 'email', type: 'string', required: true }] })
 * // → z.object({ email: z.string() }).strict()
 */
export function compileResourceSchema(resource, { partial = false, coerce = false } = {}) {
  const types = coerce ? TYPE_ZOD_COERCED : TYPE_ZOD;
  const shape = {};
  for (const f of resource.fields) {
    let field = (types[f.type] ?? (() => z.unknown()))();
    if (partial || !f.required) field = field.optional();
    shape[f.name] = field;
  }
  return z.object(shape).strict();
}
