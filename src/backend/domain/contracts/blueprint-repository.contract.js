/**
 * ES: Contrato (Interfaz abstracta) para el repositorio de Planos Técnicos (Blueprints).
 * Define los métodos mandatorios que deben ser provistos por la capa de infraestructura.
 * 
 * EN: Contract (Abstract interface) for the Technical Layouts (Blueprints) repository.
 * Defines the mandatory methods that must be provided by the infrastructure layer.
 */
export class BlueprintRepositoryContract {
  /**
   * ES: Registra o inserta un nuevo plano técnico e inicia su auditoría.
   * EN: Registers or inserts a new technical layout and starts its audit path.
   * 
   * @param {Object} blueprintData 
   * @returns {Promise<Object>}
   */
  async create(blueprintData) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Actualiza un plano técnico existente y genera un evento de auditoría.
   * EN: Updates an existing technical layout and triggers an audit event.
   * 
   * @param {string} id 
   * @param {Object} blueprintData 
   * @returns {Promise<Object>}
   */
  async update(id, blueprintData) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Borrado lógico de un plano técnico registrando la auditoría del suceso.
   * EN: Logical deletion of a technical layout registering the audit event.
   * 
   * @param {string} id 
   * @returns {Promise<Object>}
   */
  async delete(id) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Busca un plano técnico activo por su identificador único.
   * EN: Finds an active technical layout by its unique identifier.
   * 
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Obtiene todos los planos técnicos que no hayan sido borrados lógicamente.
   * EN: Gets all technical layouts that have not been logically deleted.
   * 
   * @returns {Promise<Array<Object>>}
   */
  async findAllActive() {
    throw new Error('Method not implemented / Método no implementado');
  }
}
