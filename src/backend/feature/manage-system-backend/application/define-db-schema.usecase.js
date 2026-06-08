import { BackendBlueprintEntity } from '../../../domain/entities/backend-blueprint.entity.js';

/**
 * ES: Caso de Uso para definir un plano de base de datos dinámico sin código.
 * Inyecta automáticamente columnas de auditoría obligatorias (id, created_at, updated_at)
 * en cada tabla definida y guarda el resultado en el repositorio central.
 * 
 * EN: Use Case to define a dynamic no-code database layout.
 * Automatically injects mandatory audit columns (id, created_at, updated_at)
 * into every defined table and persists the blueprint in the central repository.
 */
export class DefineDbSchemaUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/blueprint.repository').BlueprintRepository} cradle.blueprintRepository
   */
  constructor({ blueprintRepository }) {
    this.blueprintRepository = blueprintRepository;
  }

  /**
   * ES: Ejecuta la definición y persistencia del plano estructural.
   * EN: Executes the structural blueprint definition and persistence.
   * 
   * @param {Object} input
   * @param {string} input.id
   * @param {string} input.name
   * @param {string} [input.version]
   * @param {Object} input.schema
   * @param {Array<Object>} input.schema.tables
   * @returns {Promise<Object>} ES: Plano guardado. EN: Saved blueprint.
   */
  async execute({ id, name, version = 'v1', schema }) {
    if (!schema || !Array.isArray(schema.tables)) {
      throw new Error('Schema must contain a tables list / El esquema debe contener una lista de tablas');
    }

    // ES: Inyectar automáticamente columnas de auditoría y claves primarias a cada tabla.
    // EN: Automatically inject audit columns and primary keys into every table.
    const processedTables = schema.tables.map(table => {
      const columns = [...table.columns];

      // ES: Insertar 'id' al inicio si no está declarado.
      // EN: Prepend 'id' if not declared.
      if (!columns.some(col => col.name.toLowerCase() === 'id')) {
        columns.unshift({
          name: 'id',
          type: 'integer',
          nullable: false,
          unique: true,
        });
      }

      // ES: Anexar 'created_at' si no existe.
      // EN: Append 'created_at' if not present.
      if (!columns.some(col => col.name.toLowerCase() === 'created_at')) {
        columns.push({
          name: 'created_at',
          type: 'text',
          nullable: false,
          defaultValue: 'CURRENT_TIMESTAMP',
        });
      }

      // ES: Anexar 'updated_at' si no existe.
      // EN: Append 'updated_at' if not present.
      if (!columns.some(col => col.name.toLowerCase() === 'updated_at')) {
        columns.push({
          name: 'updated_at',
          type: 'text',
          nullable: false,
          defaultValue: 'CURRENT_TIMESTAMP',
        });
      }

      return {
        ...table,
        columns,
      };
    });

    const processedSchema = {
      ...schema,
      tables: processedTables,
    };

    // ES: Validar estructuralmente la entidad de dominio.
    // EN: Structurally validate the domain entity.
    const blueprintEntity = new BackendBlueprintEntity({
      id,
      name,
      version,
      schema: processedSchema,
    });

    return await this.blueprintRepository.create(blueprintEntity);
  }
}
