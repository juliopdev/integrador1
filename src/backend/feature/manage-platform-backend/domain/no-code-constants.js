/**
 * Constantes del dominio No-Code. Fuente: .doc/rules/no-code.md (tipos, reservadas, canales).
 * @module no-code-constants
 */

/** Tipos de campo permitidos en una resource del contrato (no-code.md). */
export const FIELD_TYPES = [
  'string', 'text', 'integer', 'float', 'boolean', 'date', 'datetime', 'json', 'asset', 'relation',
];

/** Verbos HTTP soportados por un endpoint No-Code. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

/** Canales WebSocket habilitables (no-code.md). */
export const WS_CHANNELS = ['user_to_user', 'user_to_room', 'user_to_admin', 'notifications_global'];

/**
 * Primer segmento de ruta prohibido para endpoints No-Code (no-code.md): colisionarían con
 * rutas del sistema o de auth. La validación se hace sobre el primer segmento de `path`.
 */
export const RESERVED_ENDPOINT_SEGMENTS = [
  'user', 'users', 'me', 'auth', 'login', 'register', 'logout', 'refresh', 'password',
  'health', 'metrics', 'admin', 'system', 'api', 'api-system', 'ws', 'socket', 'openapi',
];

/**
 * Nombres de campo que el dispatcher reconoce como "dueño" de una fila (`access: ['owner']`).
 * Case-insensitive. Debe mantenerse sincronizado con `resolveOwnerField` en dynamic-router.js —
 * la constante vive acá para que `publish-contract` valide que resources con endpoints owner-only
 * tengan al menos uno de estos fields. Sin esto, el asistente permite publicar contratos que
 * fallan siempre con 403 en runtime (bug del contrato de "Mi Tienda Online", Iter 2026-07).
 */
export const OWNER_FIELD_NAMES = ['user_id', 'userId', 'created_by', 'createdBy', 'user'];
