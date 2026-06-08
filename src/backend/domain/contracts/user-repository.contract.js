/**
 * ES: Contrato (Interfaz abstracta) para el repositorio de Usuarios Finales.
 * EN: Contract (Abstract interface) for the End-Users repository.
 */
export class UserRepositoryContract {
  /**
   * ES: Busca un usuario final en el contexto del inquilino solicitado.
   * EN: Finds an end-user in the context of the requested tenant.
   * 
   * @param {string} email 
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email) {
    throw new Error('Method not implemented / Método no implementado');
  }

  /**
   * ES: Registra un nuevo usuario final en la base de datos de inquilino aislada.
   * EN: Registers a new end-user inside the isolated tenant database.
   * 
   * @param {Object} userData 
   * @returns {Promise<Object>}
   */
  async create(userData) {
    throw new Error('Method not implemented / Método no implementado');
  }
}
