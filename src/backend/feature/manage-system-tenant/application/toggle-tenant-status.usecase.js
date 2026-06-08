/**
 * ES: Caso de Uso para suspender o reactivar a un inquilino.
 * EN: Use Case to suspend or reactivate a tenant.
 */
export class ToggleTenantStatusUseCase {
  /**
   * @param {Object} cradle
   * @param {import('../infrastructure/tenant.repository').TenantRepository} cradle.tenantRepository
   */
  constructor({ tenantRepository }) {
    this.tenantRepository = tenantRepository;
  }

  /**
   * ES: Alterna el estado del inquilino entre 'active' y 'suspended'.
   * EN: Toggles the tenant status between 'active' and 'suspended'.
   * 
   * @param {string} id
   * @returns {Promise<Object>} ES: Inquilino actualizado. EN: Updated tenant.
   */
  async execute(id) {
    if (!id) {
      throw new Error('Tenant ID is required / El ID del inquilino es obligatorio');
    }
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) {
      throw new Error(`Tenant "${id}" not found / Inquilino no encontrado`);
    }
    
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
    return await this.tenantRepository.update(id, { status: newStatus });
  }
}
