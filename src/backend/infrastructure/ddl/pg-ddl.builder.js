/**
 * @module pg-ddl.builder
 * @description Generación de DDL parametrizado para Postgres (Neon) desde una resource del contrato No-Code.
 * Las tablas dinámicas NO las gobierna Drizzle (estático/codegen); se construyen aquí en runtime
 * (no-code.md). Identificadores validados + escapados (anti-inyección).
 */

import { AppError } from '../../common/errors.js';

const TYPE_MAP = {
  string: 'text',
  text: 'text',
  integer: 'bigint',
  float: 'double precision',
  boolean: 'boolean',
  date: 'date',
  datetime: 'timestamptz',
  json: 'jsonb',
  asset: 'text', // referencia al archivo en el provider de storage
  relation: 'text', // FK (integridad referencial se añade aparte)
};

const IDENT = /^[a-z][a-z0-9_]*$/;

function ident(name) {
  if (typeof name !== 'string' || !IDENT.test(name)) {
    throw new AppError(400, 'INVALID_IDENTIFIER', `Identificador SQL inválido: ${name}`);
  }
  return `"${name}"`;
}

function pgType(field) {
  const type = typeof field === 'string' ? field : field.type;
  const length = typeof field === 'string' ? undefined : field.length;

  if (type === 'string') {
    if (length && Number.isInteger(length) && length > 0) {
      return `varchar(${length})`;
    }
    return 'varchar(255)';
  }
  const mapped = TYPE_MAP[type];
  if (!mapped) throw new AppError(400, 'UNSUPPORTED_FIELD_TYPE', `Tipo de campo no soportado: ${type}`);
  return mapped;
}

/**
 * Serializa un `defaultValue` (siempre string en el contrato JSON) al literal SQL correcto
 * según el tipo del campo. Antiinjection: los strings/text se escapan con doble comilla simple
 * estilo Postgres. Los tipos que no admiten default (`asset`, `relation`) se rechazan en el
 * schema Zod — acá asumimos que `defaultValue` es válido para el `type`.
 */
function pgDefaultLiteral(type, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const val = String(raw);
  switch (type) {
    case 'integer':
    case 'float':
      if (!/^-?\d+(\.\d+)?$/.test(val)) throw new AppError(400, 'INVALID_DEFAULT_VALUE', `Default inválido para ${type}: ${val}`);
      return val;
    case 'boolean':
      if (!/^(true|false)$/i.test(val)) throw new AppError(400, 'INVALID_DEFAULT_VALUE', `Default inválido para boolean: ${val}`);
      return val.toLowerCase();
    case 'json':
      // Guardamos el JSON tal cual dentro de comillas y con cast a jsonb.
      return `'${val.replace(/'/g, "''")}'::jsonb`;
    case 'date':
    case 'datetime':
      // Si el usuario escribió `now()`/`current_timestamp` respetamos la expresión SQL cruda —
      // patrón universal en Postgres para timestamps por defecto.
      if (/^(now\(\)|current_timestamp|current_date)$/i.test(val)) return val.toUpperCase();
      return `'${val.replace(/'/g, "''")}'`;
    case 'string':
    case 'text':
    default:
      return `'${val.replace(/'/g, "''")}'`;
  }
}

function columnDefinition(f, allResources = []) {
  const parts = [`${ident(f.name)} ${pgType(f)}`];
  if (f.generatedAs) {
    parts.push(`GENERATED ALWAYS AS (${f.generatedAs}) STORED`);
    return parts.join(' ');
  }
  const def = pgDefaultLiteral(f.type, f.defaultValue);
  if (def !== null) parts.push(`DEFAULT ${def}`);
  if (f.required) parts.push('NOT NULL');
  if (f.unique) parts.push('UNIQUE');
  if (f.check) parts.push(`CHECK (${f.check})`);

  if (f.type === 'relation' && f.target) {
    const targetResource = allResources.find((r) => r.name === f.target);
    const targetTable = targetResource ? targetResource.physicalName : `${f.target}_db`;
    parts.push(`REFERENCES ${ident(targetTable)}(id)`);
    if (f.required) {
      parts.push('ON DELETE CASCADE');
    } else {
      parts.push('ON DELETE SET NULL');
    }
  }

  return parts.join(' ');
}

/**
 * Genera una sentencia `CREATE TABLE IF NOT EXISTS` para una resource del contrato No-Code.
 * Incluye los campos de auditoría: `id` (text), `created_at`/`updated_at` (bigint), `deleted_at` (bigint nullable).
 *
 * @param {object} resource - Resource del contrato con sus `fields` y `physicalName`.
 * @param {object[]} [allResources=[]] - Lista completa de resources del contrato (para resolver FK de `relation`).
 * @returns {string} Sentencia DDL CREATE TABLE.
 * @example
 * buildCreateTable({ physicalName: 'posts', fields: [{ name: 'title', type: 'string', required: true }] })
 * // → CREATE TABLE IF NOT EXISTS "posts" ("id" text PRIMARY KEY, "title" varchar(255) NOT NULL, "created_at" bigint NOT NULL, "updated_at" bigint NOT NULL, "deleted_at" bigint)
 */
export function buildCreateTable(resource, allResources = []) {
  const columns = [
    `${ident('id')} text PRIMARY KEY`,
    ...resource.fields.map((f) => columnDefinition(f, allResources)),
    `${ident('created_at')} bigint NOT NULL`,
    `${ident('updated_at')} bigint NOT NULL`,
    `${ident('deleted_at')} bigint`,
  ];
  return `CREATE TABLE IF NOT EXISTS ${ident(resource.physicalName)} (${columns.join(', ')})`;
}

/**
 * Genera sentencias DDL de migración (`ALTER TABLE`) para un diff de campos.
 * Orden: ADD → RENAME → RETYPE. Los `drops` son deprecación lógica (la columna se conserva).
 * Cada sentencia es parametrizada/escapada; el caller debe ejecutarlas dentro de una transacción.
 *
 * @param {string} physicalName - Nombre físico de la tabla.
 * @param {{ adds: object[], renames: { from: string, to: string }[], retypes: { name: string, from: string, to: string }[], drops: object[] }} diff - Diff generado por contract-diff.js.
 * @param {object[]} [allResources=[]] - Lista completa de resources del contrato (para FK de nuevas columnas `relation`).
 * @returns {string[]} Arreglo de sentencias SQL para aplicar en orden.
 * @example
 * buildAlterStatements('posts', { adds: [{ name: 'views', type: 'integer' }], renames: [], retypes: [], drops: [] })
 * // → ["ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "views" bigint"]
 */
export function buildAlterStatements(physicalName, diff, allResources = []) {
  const t = ident(physicalName);
  const statements = [];
  // Columnas nuevas SIEMPRE nullable si no hay default (no se puede ADD NOT NULL sobre filas
  // existentes sin popular las viejas). Con default sí se puede — Postgres popula las viejas.
  // UNIQUE se aplica como índice separado post-ADD para que sea idempotente (`IF NOT EXISTS`).
  for (const f of diff.adds) {
    const parts = [`ADD COLUMN IF NOT EXISTS ${ident(f.name)} ${pgType(f)}`];
    if (f.generatedAs) {
      parts.push(`GENERATED ALWAYS AS (${f.generatedAs}) STORED`);
    } else {
      const def = pgDefaultLiteral(f.type, f.defaultValue);
      if (def !== null) parts.push(`DEFAULT ${def}`);
      if (f.required && def !== null) parts.push('NOT NULL');
      if (f.check) parts.push(`CHECK (${f.check})`);

      if (f.type === 'relation' && f.target) {
        const targetResource = allResources.find((r) => r.name === f.target);
        const targetTable = targetResource ? targetResource.physicalName : `${f.target}_db`;
        parts.push(`REFERENCES ${ident(targetTable)}(id)`);
        if (f.required) {
          parts.push('ON DELETE CASCADE');
        } else {
          parts.push('ON DELETE SET NULL');
        }
      }
    }
    statements.push(`ALTER TABLE ${t} ${parts.join(' ')}`);
    if (f.unique) {
      // Iter UX P3.3: UNIQUE via índice separado — permite `IF NOT EXISTS` (no-op idempotente
      // en rollbacks/relanzamientos). Nombre determinista: `<tabla>_<columna>_key`.
      const idxName = ident(`${physicalName}_${f.name}_key`);
      statements.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${idxName} ON ${t} (${ident(f.name)})`);
    }
  }
  for (const r of diff.renames) {
    statements.push(`ALTER TABLE ${t} RENAME COLUMN ${ident(r.from)} TO ${ident(r.to)}`);
  }
  for (const r of diff.retypes) {
    statements.push(`ALTER TABLE ${t} ALTER COLUMN ${ident(r.name)} TYPE ${pgType({ type: r.to })} USING ${ident(r.name)}::${pgType({ type: r.to })}`);
  }
  return statements;
}

/**
 * Valida y escapa un identificador SQL (tabla/columna) para prevenir inyección.
 * Solo acepta `[a-z][a-z0-9_]*` y lo envuelve en dobles comillas.
 *
 * @param {string} name - Nombre del identificador a validar y escapar.
 * @returns {string} Identificador escapado apto para SQL.
 * @throws {AppError} Si el identificador no cumple el patrón `[a-z][a-z0-9_]*`.
 */
export { ident as escapeIdentifier };
