/**
 * ES: Caso de Uso para obtener el listado de todos los inquilinos.
 * EN: Use Case to retrieve the list of all tenants.
 */
export class GetTenantsUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/tenant.repository').TenantRepository} cradle.tenantRepository
   */
  constructor({ tenantRepository }) {
    this.tenantRepository = tenantRepository;
  }

  /**
   * ES: Ejecuta la consulta para obtener todos los inquilinos.
   * EN: Executes the query to fetch all tenants.
   * 
   * @returns {Promise<Array<Object>>}
   */
  async execute() {
    return await this.tenantRepository.findAll();
  }
}
