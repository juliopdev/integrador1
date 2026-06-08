/**
 * ES: Caso de Uso para eliminar lógicamente un plano técnico (soft-delete).
 * EN: Use Case to logically delete a technical blueprint (soft-delete).
 */
export class DeleteBackendUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/blueprint.repository').BlueprintRepository} cradle.blueprintRepository
   */
  constructor({ blueprintRepository }) {
    this.blueprintRepository = blueprintRepository;
  }

  /**
   * ES: Ejecuta la eliminación lógica del plano técnico.
   * EN: Executes the logical deletion of the technical blueprint.
   * 
   * @param {string} id 
   * @returns {Promise<Object>}
   */
  async execute(id) {
    if (!id) {
      throw new Error('Blueprint ID is required / El ID del plano es obligatorio');
    }

    const existing = await this.blueprintRepository.findById(id);
    if (!existing) {
      throw new Error(`Blueprint "${id}" not found / Plano técnico no encontrado`);
    }

    return await this.blueprintRepository.delete(id);
  }
}
