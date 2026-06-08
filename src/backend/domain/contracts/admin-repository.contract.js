/**
 * ES: Contrato (Interfaz abstracta) para el repositorio de Administradores.
 * Define los métodos mandatorios que deben ser provistos por la capa de infraestructura.
 * 
 * EN: Contract (Abstract interface) for the Administrators repository.
 * Defines the mandatory methods that must be provided by the infrastructure layer.
 */
export class AdminRepositoryContract {
  /**
   * ES: Busca un administrador o master por su correo electrónico.
   * EN: Finds an administrator or master by their email address.
   * 
   * @param {string} email 
   * @param {string} [tenantId] - ES: Opcional si es Superadmin. EN: Optional if Superadmin.
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email, tenantId) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Registra o inserta un nuevo administrador en el almacén persistente.
   * EN: Registers or inserts a new administrator into persistent storage.
   * 
   * @param {Object} adminData 
   * @param {string} [tenantId] 
   * @returns {Promise<Object>}
   */
  async create(adminData, tenantId) {
    throw new Error('Method not implemented / Método no implementado');
  }
}
