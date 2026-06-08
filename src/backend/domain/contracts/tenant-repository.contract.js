/**
 * ES: Contrato (Interfaz abstracta) para el repositorio de Inquilinos (Tenants).
 * Define los métodos mandatorios que deben ser provistos por la capa de infraestructura.
 * 
 * EN: Contract (Abstract interface) for the Tenants repository.
 * Defines the mandatory methods that must be provided by the infrastructure layer.
 */
export class TenantRepositoryContract {
  /**
   * ES: Registra o inserta un nuevo inquilino en la base de datos del sistema.
   * EN: Registers or inserts a new tenant into the system database.
   * 
   * @param {Object} tenantData 
   * @returns {Promise<Object>}
   */
  async create(tenantData) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Busca un inquilino por su identificador único.
   * EN: Finds a tenant by its unique identifier.
   * 
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Busca un inquilino por su subdominio.
   * EN: Finds a tenant by its subdomain.
   * 
   * @param {string} subdomain 
   * @returns {Promise<Object|null>}
   */
  async findBySubdomain(subdomain) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Obtiene la lista completa de inquilinos en el sistema.
   * EN: Gets the complete list of tenants in the system.
   * 
   * @returns {Promise<Array<Object>>}
   */
  async findAll() {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Actualiza los datos de un inquilino existente.
   * EN: Updates an existing tenant's details.
   * 
   * @param {string} id
   * @param {Object} tenantData
   * @returns {Promise<Object>}
   */
  async update(id, tenantData) {
    throw new Error('Method not implemented / Método no implementado');
  }
}
