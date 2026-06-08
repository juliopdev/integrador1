import { z } from 'zod';

// ES: Validador de columnas para esquemas dinámicos no-code.
// EN: Column validator for dynamic no-code schemas.
const columnSchema = z.object({
  name: z.string()
    .min(1, 'Column name is required / El nombre de la columna es obligatorio')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Column name must be alphanumeric and start with a letter or underscore / El nombre de la columna debe ser alfanumérico y comenzar con letra o guion bajo'),
  type: z.enum(['text', 'integer', 'real', 'boolean']),
  nullable: z.boolean().default(true),
  unique: z.boolean().default(false),
  defaultValue: z.any().optional(),
});

// ES: Validador de tablas para esquemas dinámicos no-code.
// EN: Table validator for dynamic no-code schemas.
const tableSchema = z.object({
  name: z.string()
    .min(1, 'Table name is required / El nombre de la tabla es obligatorio')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Table name must be alphanumeric and start with a letter or underscore / El nombre de la tabla debe ser alfanumérico y comenzar con letra o guion bajo'),
  columns: z.array(columnSchema).min(1, 'At least one column is required / Se requiere al menos una columna'),
});

// ES: Esquema Zod de validación estructural para planos de backend.
// EN: Zod structural validation schema for backend blueprints.
const blueprintValidationSchema = z.object({
  id: z.string().min(1, 'ID is required / El ID es obligatorio'),
  name: z.string().min(1, 'Name is required / El nombre es obligatorio'),
  version: z.string().default('v1'),
  schema: z.object({
    tables: z.array(tableSchema).default([]),
  }),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().nullable().optional(),
});

/**
 * ES: Entidad de Dominio que representa un Plano Técnico (Blueprint).
 * Valida la estructura JSON enviada para crear/actualizar esquemas de bases de datos dinámicas.
 * 
 * EN: Domain Entity representing a Technical Layout (Blueprint).
 * Validates the JSON structure sent to create/update dynamic database schemas.
 */
export class BackendBlueprintEntity {
  /**
   * @param {Object} data - ES: Datos del plano. EN: Blueprint details.
   */
  constructor(data) {
    Object.assign(this, BackendBlueprintEntity.validate(data));
  }

  /**
   * ES: Valida los datos utilizando el esquema de Zod.
   * EN: Validates data using the Zod schema.
   * 
   * @param {Object} data 
   * @returns {Object} ES: Datos validados. EN: Validated details.
   */
  static validate(data) {
    const result = blueprintValidationSchema.safeParse(data);
    if (!result.success) {
      throw new Error(`Validation Error / Error de Validación: ${JSON.stringify(result.error.format())}`);
    }
    return result.data;
  }
}
