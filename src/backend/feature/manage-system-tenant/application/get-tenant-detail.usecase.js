/**
 * ES: Caso de Uso para obtener los detalles de un inquilino por su ID.
 * EN: Use Case to retrieve the details of a tenant by its ID.
 */
export class GetTenantDetailUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/tenant.repository').TenantRepository} cradle.tenantRepository
   */
  constructor({ tenantRepository }) {
    this.tenantRepository = tenantRepository;
  }

  /**
   * ES: Obtiene los datos del inquilino especificado.
   * EN: Fetches the specified tenant data.
   * 
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async execute(id) {
    if (!id) {
      throw new Error('Tenant ID is required / El ID del inquilino es obligatorio');
    }
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) {
      throw new Error(`Tenant "${id}" not found / Inquilino no encontrado`);
    }
    return tenant;
  }
}
