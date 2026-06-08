import { BackendBlueprintEntity } from '../../../domain/entities/backend-blueprint.entity.js';

/**
 * ES: Caso de Uso para actualizar un plano de base de datos dinámico sin código existente.
 * Valida la entrada y asegura que las columnas de auditoría estén presentes en cada tabla.
 * 
 * EN: Use Case to update an existing dynamic no-code database layout.
 * Validates the input and ensures that audit columns are present in each table.
 */
export class UpdateBackendUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/blueprint.repository').BlueprintRepository} cradle.blueprintRepository
   */
  constructor({ blueprintRepository }) {
    this.blueprintRepository = blueprintRepository;
  }

  /**
   * ES: Actualiza un plano de backend por su ID.
   * EN: Updates a backend blueprint by its ID.
   * 
   * @param {string} id
   * @param {Object} input
   * @param {string} input.name
   * @param {string} [input.version]
   * @param {Object} input.schema
   * @param {Array<Object>} input.schema.tables
   * @returns {Promise<Object>} ES: Plano actualizado. EN: Updated blueprint.
   */
  async execute(id, { name, version = 'v1', schema }) {
    if (!id) {
      throw new Error('Blueprint ID is required for updating / El ID del plano es obligatorio para actualizar');
    }

    if (!schema || !Array.isArray(schema.tables)) {
      throw new Error('Schema must contain a tables list / El esquema debe contener una lista de tablas');
    }

    // ES: Asegurar inyección de columnas de auditoría y claves primarias.
    // EN: Ensure injection of audit columns and primary keys.
    const processedTables = schema.tables.map(table => {
      const columns = [...table.columns];

      if (!columns.some(col => col.name.toLowerCase() === 'id')) {
        columns.unshift({
          name: 'id',
          type: 'integer',
          nullable: false,
          unique: true,
        });
      }

      if (!columns.some(col => col.name.toLowerCase() === 'created_at')) {
        columns.push({
          name: 'created_at',
          type: 'text',
          nullable: false,
          defaultValue: 'CURRENT_TIMESTAMP',
        });
      }

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

    // ES: Validar estructuralmente con la entidad.
    // EN: Validate structurally with the entity.
    const blueprintEntity = new BackendBlueprintEntity({
      id,
      name,
      version,
      schema: processedSchema,
    });

    // ES: Verificar que el blueprint existe antes de actualizar.
    // EN: Verify blueprint existence before updating.
    const existing = await this.blueprintRepository.findById(id);
    if (!existing) {
      throw new Error(`Blueprint "${id}" not found / Plano técnico no encontrado`);
    }

    return await this.blueprintRepository.update(id, blueprintEntity);
  }
}
