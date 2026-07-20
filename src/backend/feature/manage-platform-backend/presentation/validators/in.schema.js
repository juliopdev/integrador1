/**
 * Schemas Zod de validación de entrada para las rutas API de manage-platform-backend.
 * @module in.schema
 */

import { z } from 'zod';
import { idParam, backendVersion, coerceBoolean } from '../../../../common/validators.js';

/** Parámetros de ruta: identificador del tenant sobre el que autora el Superadmin. */
export const tenantIdParamSchema = idParam('tenantId');

/** Parámetros de ruta: identificador del tenant + versión del contrato (`v1`, `v2`, …). */
export const backendVersionParamSchema = z.object({
  tenantId: z.string().min(1),
  version: backendVersion,
});

// `linkProviderSchema` + `unlinkProviderParamsSchema` + `unlinkProviderBodySchema` movidos a
// `manage-platform-provider/presentation/validators/in.schema.js` (split P8).

const VERB = z.enum(['GET', 'POST', 'PUT', 'DELETE']);

// `createRoleSchema` movido a `manage-platform-role/presentation/validators/in.schema.js` (split P8).
// `VERB` permanece porque `addDraftEndpointSchema` (más abajo) también lo usa.

/** Habilitar/deshabilitar la API Auth de Users + sus estrategias. `enabled` acepta string desde `Form`. */
export const toggleAuthSchema = z.object({
  enabled: coerceBoolean,
  strategies: z.array(z.string()).optional(),
});

/** Habilitar/deshabilitar un canal WebSocket. `enabled` acepta string desde `Form` SSR;
 * ausente = false (switch desmarcado — sin hidden gemelo, P0.2). */
export const toggleWsSchema = z.object({
  channel: z.string().min(1),
  enabled: coerceBoolean.optional().default(false),
});

/** P7: iniciar el borrador eligiendo el modo (paso 1 v2 — editar vs upgradear). */
export const startDraftSchema = z.object({
  mode: z.enum(['edit', 'upgrade']),
});

/**
 * Coerce a array desde submits SSR. El `Form` HTML manda:
 *   - Sin selección: campo ausente (undefined) → []
 *   - Una sola: string
 *   - Varias: array
 * Estas 3 formas se normalizan a array de strings limpios.
 */
const coerceArray = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return [];
    if (Array.isArray(v)) return v.map(String);
    return [String(v)];
  },
  z.array(z.string()),
);

/**
 * Agregar un resource al draft del asistente (`_step-manage-api`).
 * @typedef {Object} AddDraftResourceInput
 * @property {string} name - Nombre lógico del resource.
 * @property {string} [physicalName] - Nombre físico de tabla (derivado como `<name>_db` si ausente).
 * @property {'sql'|'nosql'} store - Tipo de store destino.
 * @property {boolean} [manageable=true] - Si el resource es gestionable desde el dashboard.
 * @property {Object} [endpoint] - Configuración del endpoint asociado.
 * @property {string} [endpoint.path] - Ruta del endpoint (debe empezar con `/`).
 * @property {string[]} [endpoint.methods] - Métodos HTTP permitidos.
 * @property {Object} [endpoint.access] - Matriz método → audiencias autorizadas.
 */
export const addDraftResourceSchema = z.object({
  name: z.string().min(1),
  // P6c: derivado (`<name>_db`) cuando no viene — el asistente v2 solo pide el nombre lógico.
  physicalName: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().min(1).optional(),
  ),
  store: z.enum(['sql', 'nosql']),
  manageable: coerceBoolean.optional().default(true),
  // Iter UX P4.2: el form unificado del Paso 4 manda el shape del endpoint ya anidado —
  // el `expandDotted` del componente Form transforma `endpoint.path` en `{ endpoint: { path } }`
  // antes del POST. Todos opcionales — sin ellos el use case cae al default histórico.
  endpoint: z.object({
    path: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().startsWith('/').optional(),
    ),
    methods: coerceArray.optional(),
    access: z.object({
      GET: coerceArray.optional(),
      POST: coerceArray.optional(),
      PUT: coerceArray.optional(),
      DELETE: coerceArray.optional(),
    }).partial().optional(),
  }).partial().optional(),
});


/**
 * Actualizar un resource del draft.
 * @typedef {Object} UpdateDraftResourceInput
 * @property {string} [newName] - Nuevo nombre lógico del resource.
 * @property {string} [physicalName] - Nuevo nombre físico de tabla.
 * @property {'sql'|'nosql'} store - Tipo de store destino.
 * @property {boolean} [manageable=true] - Si el resource es gestionable desde el dashboard.
 * @property {Object} [endpoint] - Configuración del endpoint asociado.
 * @property {string} [endpoint.path] - Ruta del endpoint (debe empezar con `/`).
 * @property {string[]} [endpoint.methods] - Métodos HTTP permitidos.
 * @property {Object} [endpoint.access] - Matriz método → audiencias autorizadas.
 */
export const updateDraftResourceSchema = z.object({
  newName: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().min(1).optional(),
  ),
  physicalName: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().min(1).optional(),
  ),
  store: z.enum(['sql', 'nosql']),
  manageable: coerceBoolean.optional().default(true),
  endpoint: z.object({
    path: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().startsWith('/').optional(),
    ),
    methods: coerceArray.optional(),
    access: z.object({
      GET: coerceArray.optional(),
      POST: coerceArray.optional(),
      PUT: coerceArray.optional(),
      DELETE: coerceArray.optional(),
    }).partial().optional(),
  }).partial().optional(),
});


/**
 * Agregar un field a un resource del draft. `required` acepta string desde `Form` SSR.
 * @typedef {Object} AddDraftFieldInput
 * @property {string} name - Nombre del field.
 * @property {string} type - Tipo de dato del field (text, number, boolean, etc.).
 * @property {boolean} [required=false] - Si el field es obligatorio.
 * @property {string} [provider] - Proveedor externo vinculado (ej: cloudinary).
 * @property {string} [target] - Campo destino del proveedor.
 * @property {string} [defaultValue] - Valor por defecto en formato string.
 * @property {boolean} [unique=false] - Si el field debe ser único.
 * @property {string} [description] - Descripción del field (máx. 280 chars).
 * @property {number} [length] - Longitud máxima del field.
 * @property {string} [check] - Restricción CHECK SQL.
 */
export const addDraftFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: coerceBoolean.optional().default(false),
  provider: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().min(1).optional()
  ),
  target: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().min(1).optional()
  ),
  defaultValue: z.string().optional(),
  unique: coerceBoolean.optional().default(false),
  description: z.string().max(280).optional(),
  length: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  check: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().optional()
  ),
});
/**
 * Agregar un endpoint al draft. Los `methods` llegan como array desde clientes JSON o como CSV
 * desde el `Form` SSR (los checkboxes con el mismo `name` FormData los junta en el último; los
 * hidden separan con coma). El use case normaliza a mayúsculas y deduplica.
 * @typedef {Object} AddDraftEndpointInput
 * @property {string} path - Ruta del endpoint (debe empezar con `/`).
 * @property {string} resource - Nombre del resource asociado.
 * @property {string[]|string} methods - Métodos HTTP (array o CSV desde SSR).
 * @property {Object} [access] - Matriz método → audiencias autorizadas (P7.2).
 */
export const addDraftEndpointSchema = z.object({
  path: z.string().min(1),
  resource: z.string().min(1),
  methods: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean))),
  // P7.2 (no-code.md §10): matriz método → audiencias. Un solo checkbox llega como string.
  access: z
    .record(
      z.string(),
      z.union([z.array(z.string().min(1)), z.string().min(1)]).transform((v) => (Array.isArray(v) ? v : [v])),
    )
    .optional(),
});

/**
 * Actualizar la sección `auth` del draft. `userAuthEnabled` acepta string desde `Form` SSR
 * (checkbox solo — sin hidden gemelo: duplicar la key produce un array y coerceBoolean lo
 * rechaza; ausente = false). `strategies` y `redirectUris` llegan como array (Form recolecta
 * múltiples checkboxes) o como CSV/newline-separated (fallback). El use case dedupe y filtra vacíos.
 * @typedef {Object} UpdateDraftAuthInput
 * @property {boolean} [userAuthEnabled=false] - Habilitar autenticación de usuarios finales.
 * @property {string[]|string} [strategies] - Estrategias OAuth habilitadas (array o CSV).
 * @property {string[]|string} [redirectUris] - URIs de redirección post-login (array o CSV).
 */
export const updateDraftAuthSchema = z.object({
  userAuthEnabled: coerceBoolean.optional().default(false),
  strategies: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => {
      if (v == null) return [];
      return Array.isArray(v) ? v : String(v).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    }),
  redirectUris: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => {
      if (v == null) return [];
      return Array.isArray(v) ? v : String(v).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    }),
});
