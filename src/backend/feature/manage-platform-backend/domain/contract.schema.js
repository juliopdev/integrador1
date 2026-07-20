import { z } from 'zod';
import { DomainError } from '../../../common/errors.js';
import { FIELD_TYPES, HTTP_METHODS, WS_CHANNELS, RESERVED_ENDPOINT_SEGMENTS, OWNER_FIELD_NAMES } from './no-code-constants.js';

/**
 * Schema Zod del contrato No-Code (`schema_json`). Valida lo que el Superadmin autora antes de
 * compilarlo. Fuente de verdad: .doc/rules/no-code.md. El contrato parseado es el modelo de
 * dominio que consumen el DDL builder, el compilador Zod y el dispatcher.
 *
 * @typedef {Object} FieldSchema
 * @property {string} id - UUID estable para migración por field.id.
 * @property {string} name - Nombre snake_case del campo.
 * @property {string} type - Tipo del field (FIELD_TYPES).
 * @property {boolean} [required] - Si el campo es requerido.
 * @property {string} [provider] - Provider requerido si type='asset'.
 * @property {string} [target] - Resource referenciado si type='relation'.
 * @property {string} [defaultValue] - Valor por defecto.
 * @property {boolean} [unique] - Si aplica UNIQUE constraint.
 * @property {string} [description] - Descripción (max 280 chars).
 * @property {string} [check] - Expresión CHECK.
 * @property {number} [length] - Longitud del campo.
 *
 * @typedef {Object} ResourceSchema
 * @property {string} name - Nombre snake_case.
 * @property {string} store - "sql" | "nosql".
 * @property {string} physicalName - Nombre físico de tabla.
 * @property {FieldSchema[]} fields - Fields del resource.
 * @property {boolean} [manageable] - Si es gestionable desde UI.
 *
 * @typedef {Object} EndpointSchema
 * @property {string} path - Ruta del endpoint (empieza con "/").
 * @property {string} resource - Resource destino.
 * @property {string[]} methods - Verbos HTTP.
 * @property {Object} [access] - Matriz método → audiencias.
 */

const IDENT = /^[a-z][a-z0-9_]*$/; // snake_case para nombres físicos/campos

const fieldSchema = z
  .object({
    id: z.string().min(1), // UUID estable: la migración mapea por id, no por name
    name: z.string().regex(IDENT, 'El nombre del campo debe ser snake_case.'),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().optional().default(false),
    provider: z.string().optional(), // requerido si type='asset'
    target: z.string().optional(), // resource referenciado si type='relation'
    // Iter UX P3.2: campos avanzados alineados con Neon/Supabase.
    //  - `defaultValue`: literal aplicado a nuevas filas cuando la insert no manda valor. Se
    //    persiste como string por simplicidad del contrato JSON; el DDL builder lo tipifica al
    //    generar el CREATE/ALTER (comillas para text, sin comillas para number, `true/false`
    //    para boolean, etc.). No aplica a `asset` ni `relation` (validado abajo).
    //  - `unique`: agrega UNIQUE constraint a la columna. El DDL emite `CREATE UNIQUE INDEX`
    //    (idempotente con `IF NOT EXISTS`) para poder aplicarlo a columnas existentes sin
    //    romper el rollback (que respeta drops lógicos).
    //  - `description`: nota humana. No afecta al DDL; se guarda para documentación y para
    //    hint en la vista del Master.
    defaultValue: z.string().optional(),
    unique: z.boolean().optional().default(false),
    description: z.string().max(280).optional(),
    check: z.string().optional(),
    generatedAs: z.string().optional(),
    length: z.coerce.number().int().positive().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.type === 'asset' && !f.provider) {
      ctx.addIssue({ code: 'custom', message: `El campo asset "${f.name}" requiere un provider.` });
    }
    if (f.defaultValue !== undefined && (f.type === 'asset' || f.type === 'relation' || f.generatedAs)) {
      ctx.addIssue({ code: 'custom', message: `El campo "${f.name}" (${f.type}) no admite valor por defecto.` });
    }
  });

const resourceSchema = z.object({
  name: z.string().regex(IDENT),
  store: z.enum(['sql', 'nosql']),
  physicalName: z.string().regex(IDENT), // estable, SIN versión
  fields: z.array(fieldSchema).min(1),
  manageable: z.boolean().optional().default(true),
});

const endpointSchema = z.object({
  path: z.string().startsWith('/'),
  resource: z.string(),
  methods: z.array(z.enum(HTTP_METHODS)).min(1),
  // P6b: matriz método → audiencias ("public" | "user" | roles Staff). Opcional: sin `access`
  // el contrato se comporta como v1 (métodos listados = public). Ver no-code.md §10.
  access: z.record(z.enum(HTTP_METHODS), z.array(z.string().min(1)).min(1)).optional(),
});

export const contractSchema = z
  .object({
    version: z.string().regex(/^v\d+$/, 'La versión debe ser v1, v2, …'),
    // P6d: modo elegido en el paso 1 del asistente v2 (editar la versión publicada vs upgradear).
    versionMode: z.enum(['edit', 'upgrade']).optional(),
    stores: z.record(z.string(), z.object({ provider: z.string(), enabled: z.boolean() })),
    resources: z.array(resourceSchema).min(1),
    endpoints: z.array(endpointSchema).min(1),
    auth: z.object({
      userAuthEnabled: z.boolean(),
      strategies: z.array(z.string()).default([]),
      redirectUris: z.array(z.string()).default([]),
    }),
    websocket: z.object({ channels: z.array(z.enum(WS_CHANNELS)).default([]) }).optional(),
  })
  .superRefine((c, ctx) => {
    const resourceNames = new Set(c.resources.map((r) => r.name));

    // Índice `resource.name → resource` para consultas rápidas dentro del loop de endpoints.
    const resourceByName = new Map(c.resources.map((r) => [r.name, r]));
    const ownerFieldNamesLower = OWNER_FIELD_NAMES.map((n) => n.toLowerCase());

    for (const ep of c.endpoints) {
      const firstSegment = ep.path.split('/').filter(Boolean)[0];
      if (firstSegment && RESERVED_ENDPOINT_SEGMENTS.includes(firstSegment)) {
        ctx.addIssue({ code: 'custom', message: `El endpoint "${ep.path}" usa una palabra reservada: ${firstSegment}.` });
      }
      // P6b: las keys de `access` deben ser un subconjunto de `methods` del propio endpoint.
      if (ep.access) {
        for (const m of Object.keys(ep.access)) {
          if (!ep.methods.includes(m)) {
            ctx.addIssue({ code: 'custom', message: `El endpoint "${ep.path}" define access para ${m} pero no expone ese método.` });
          }
        }
        // Iter 2026-07: si algún método declara `owner`, el resource DEBE tener un field owner
        // (`user_id`, `userId`, `created_by`, `createdBy` o `user`). Sin esto, el dispatcher
        // devuelve 403 permanente en runtime — bug latente que rompe el checkout de tenants
        // que declaran ownership en resources sin la columna. Ver dynamic-router.js#resolveOwnerField.
        const methodsWithOwner = Object.entries(ep.access)
          .filter(([, audiences]) => audiences.includes('owner'))
          .map(([m]) => m);
        if (methodsWithOwner.length > 0) {
          const resource = resourceByName.get(ep.resource);
          const hasOwnerField = resource?.fields?.some((f) => ownerFieldNamesLower.includes(f.name.toLowerCase()));
          if (resource && !hasOwnerField) {
            ctx.addIssue({
              code: 'custom',
              message: `El endpoint "${ep.path}" declara access "owner" en ${methodsWithOwner.join(', ')} pero el resource "${ep.resource}" no tiene ningún field de dueño (${OWNER_FIELD_NAMES.join(', ')}). Agregá uno o cambiá el access a "user".`,
            });
          }
        }
      }
      if (!resourceNames.has(ep.resource)) {
        ctx.addIssue({ code: 'custom', message: `El endpoint "${ep.path}" referencia un resource inexistente: ${ep.resource}.` });
      }
    }

    for (const r of c.resources) {
      if (!c.stores[r.store]?.enabled) {
        ctx.addIssue({ code: 'custom', message: `El resource "${r.name}" usa el store "${r.store}" que no está habilitado.` });
      }
    }
  });

/**
 * Valida un contrato y devuelve su forma canónica (con defaults aplicados).
 * @throws {DomainError} `INVALID_CONTRACT` con el primer problema encontrado.
 */
export function validateContract(input) {
  const result = contractSchema.safeParse(input);
  if (!result.success) {
    throw new DomainError('INVALID_CONTRACT', result.error.issues[0]?.message ?? 'Contrato inválido.');
  }
  return result.data;
}
