/**
 * ES: Caso de Uso para consultar los detalles de un plano de backend activo específico.
 * EN: Use Case to retrieve details of a specific active backend blueprint.
 */
export class GetBackendDetailUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/blueprint.repository').BlueprintRepository} cradle.blueprintRepository
   */
  constructor({ blueprintRepository }) {
    this.blueprintRepository = blueprintRepository;
  }

  /**
   * ES: Obtiene un plano técnico activo por su ID.
   * EN: Gets an active technical blueprint by its ID.
   * 
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async execute(id) {
    if (!id) {
      throw new Error('Blueprint ID is required / El ID del plano es obligatorio');
    }
    return await this.blueprintRepository.findById(id);
  }
}
