import { z } from 'zod';

/**
 * Módulo de validadores compartidos mediante Zod.
 * Provee esquemas y fábricas de validación que son reutilizados por múltiples features.
 * La regla de origen dicta que si un esquema aparece en dos o más features con la misma
 * forma exacta, debe promoverse a este módulo central para evitar drift.
 *
 * @module validators
 */

// Validadores compartidos por múltiples features. Regla de origen: si un mismo esquema aparece en
// dos o más features con la misma forma exacta, se promueve aquí y las features lo importan. Evita
// drift entre validadores de rutas paramétricas y centraliza los errores 400 uniformes.
//
// No añadir aquí schemas específicos de un solo feature — esos siguen viviendo en
// `<feature>/presentation/validators/in.schema.js`.

/**
 * Genera un esquema de Zod estricto para validar un parámetro de ruta que represente un ID.
 * 
 * @param {string} key - El nombre de la variable de parámetro (ej. 'tenantId', 'userId').
 * @returns {z.ZodObject<Object>} Validador de esquema de Zod.
 * @example
 * idParam('tenantId')
 * // => ZodObject<{ tenantId: ZodString }>
 */
export function idParam(key) {
  return z.object({ [key]: z.string().min(1) });
}

/**
 * Validador de Zod para el formato de versión de contrato No-Code (ej. 'v1', 'v2').
 * 
 * @type {z.ZodString}
 */
export const backendVersion = z.string().regex(/^v\d+$/, 'La versión debe ser v1, v2, …');

/**
 * Validador de Zod que coacciona valores a booleanos, aceptando textos `'true'` o `'false'`.
 * Útil para campos booleanos en formularios HTML/FormData donde el unchecked se envía como hidden y checked añade otro valor.
 * Colapsa arreglos al último elemento del array para que gane el checkbox activo sobre el valor fallback.
 * 
 * @type {z.ZodEffects<z.ZodBoolean>}
 */
export const coerceBoolean = z.preprocess(
  (v) => {
    const raw = Array.isArray(v) ? v[v.length - 1] : v;
    return raw === 'true' ? true : raw === 'false' ? false : raw;
  },
  z.boolean(),
);
