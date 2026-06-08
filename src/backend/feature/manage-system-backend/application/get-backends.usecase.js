/**
 * ES: Caso de Uso para listar todos los planos de backend activos en el sistema.
 * EN: Use Case to list all active backend blueprints in the system.
 */
export class GetBackendsUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/blueprint.repository').BlueprintRepository} cradle.blueprintRepository
   */
  constructor({ blueprintRepository }) {
    this.blueprintRepository = blueprintRepository;
  }

  /**
   * ES: Obtiene todos los planos técnicos activos.
   * EN: Gets all active technical layouts.
   * 
   * @returns {Promise<Array<Object>>}
   */
  async execute() {
    return await this.blueprintRepository.findAllActive();
  }
}
