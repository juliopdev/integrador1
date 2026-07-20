import { STATUS_CODES } from 'node:http';

/**
 * Módulo de formato estandarizado de respuestas JSON.
 * Provee las funciones {@link errorBody}, {@link successBody}, {@link paginated} y
 * {@link serialize} para construir respuestas HTTP uniformes en toda la API,
 * siguiendo el contrato de formato establecido en la documentación del proyecto.
 *
 * @module responses
 */

/**
 * @typedef {Object} ErrorResponseBody
 * @property {number} statusCode - Código de estado HTTP (ej. 400, 404, 500).
 * @property {string} error - Nombre estándar HTTP asociado al código (ej. 'Bad Request').
 * @property {string} code - Código de error de negocio en SNAKE_CASE.
 * @property {string} message - Mensaje explicativo legible para el cliente.
 * @property {any} [details] - Detalles adicionales del error (ej. fallas de validación Zod).
 */

/**
 * @typedef {Object} SuccessResponseBody
 * @property {any} data - Los datos de negocio retornados.
 * @property {any} [meta] - Metadatos adicionales de la respuesta (ej. paginación).
 */

/**
 * Construye un cuerpo de error JSON uniforme siguiendo el estándar del proyecto.
 * 
 * @param {number} statusCode - Código de estado HTTP.
 * @param {string} code - Código de error de negocio en SNAKE_CASE.
 * @param {string} message - Mensaje explicativo del error.
 * @param {any} [details] - Detalles adicionales del error.
 * @returns {ErrorResponseBody} Estructura uniforme de respuesta de error.
 * @example
 * errorBody(400, 'VALIDATION_ERROR', 'Correo inválido', { email: ['Formato incorrecto'] })
 * // => { statusCode: 400, error: 'Bad Request', code: 'VALIDATION_ERROR', message: '...', details: {...} }
 */
export function errorBody(statusCode, code, message, details) {
  const body = {
    statusCode,
    error: STATUS_CODES[statusCode] || 'Error',
    code,
    message,
  };
  if (details !== undefined) {
    body.details = details;
  }
  return body;
}

/**
 * Construye un cuerpo de respuesta exitosa uniforme para la API.
 * Encapsula la carga útil en `data` y los metadatos opcionales en `meta`.
 * 
 * @param {any} [data=null] - Payload o resultado de la operación.
 * @param {any} [meta] - Metadatos de la respuesta.
 * @returns {SuccessResponseBody} Estructura uniforme de respuesta de éxito.
 * @example
 * successBody({ id: '123', name: 'Foo' })
 * // => { data: { id: '123', name: 'Foo' } }
 * @example
 * successBody([], { page: 1, total: 0 })
 * // => { data: [], meta: { page: 1, total: 0 } }
 */
export function successBody(data = null, meta) {
  return meta === undefined ? { data } : { data, meta };
}

/**
 * Envoltorio específico para estructurar una respuesta con datos paginados.
 * 
 * @param {any[]} data - Listado de elementos correspondientes a la página actual.
 * @param {import('./pagination.js').PaginationMeta} meta - Metadatos de paginación calculados.
 * @returns {SuccessResponseBody} Respuesta paginada estructurada.
 * @example
 * paginated([{ id: 1 }], { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false })
 * // => { data: [{ id: 1 }], meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false } }
 */
export function paginated(data, meta) {
  return successBody(data, meta);
}

/**
 * Serializa y valida un payload mediante un esquema de salida Zod (con comportamiento `strip`),
 * asegurando la eliminación de cualquier propiedad sensible o inesperada antes de enviarse al cliente.
 * 
 * @template T
 * @param {{ safeParse: (input: unknown) => { success: boolean, data?: T, error?: any } }} schema - Esquema Zod de salida (`out.schema.js`).
 * @param {unknown} payload - Datos de origen a serializar.
 * @returns {T} Datos serializados y limpios según la definición del esquema.
 * @throws {Error} Si el parseo falla indicando incoherencia en los datos a exportar.
 * @example
 * const output = serialize(userOutSchema, userEntity);
 * // output => { id: '123', email: 'a@b.com' } (sin contraseña ni datos internos)
 */
export function serialize(schema, payload) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Serialization validation failed: ${parsed.error.message}`);
  }
  return parsed.data;
}
