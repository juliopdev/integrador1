/**
 * Dependency Injection Container
 * Implementación Singleton para gestionar instancias únicas
 * de servicios críticos en todo el ciclo de vida de Node.js.
 */
class Container {
  constructor() {
    if (!Container.instance) {
      // Usamos Map, el cual es eficiente y thread-safe (dentro del event-loop único de Node)
      this.services = new Map();
      Container.instance = this;
    }
    return Container.instance;
  }

  /**
   * Registra una dependencia en el contenedor.
   * @param {string} token - Identificador único de la dependencia (ej. 'DatabaseFactory').
   * @param {any} implementation - La instancia del servicio o configuración a registrar.
   */
  register(token, implementation) {
    if (this.services.has(token)) {
      console.warn(
        `[Container Warning] El token '${token}' ya está registrado. Se sobrescribirá.`,
      );
    }
    this.services.set(token, implementation);
    return this; // Permite validación encadenada si se desea
  }

  /**
   * Obtiene (resuelve) una dependencia del contenedor.
   * @param {string} token - Identificador único de la dependencia solicitada.
   * @returns {any} La instancia guardada.
   * @throws {Error} Si el token no ha sido registrado.
   */
  resolve(token) {
    if (!this.services.has(token)) {
      throw new Error(
        `[Container Error] La dependencia '${token}' no ha sido registrada en el sistema.`,
      );
    }
    return this.services.get(token);
  }

  /**
   * Limpia todo el contenedor. Útil para testing y teardown del sistema.
   */
  clear() {
    this.services.clear();
  }
}

// Congelamos (freeze) la instancia para prevenir que su estructura
// o prototipo sean modificados desde cualquier otra parte de la app
const instance = new Container();
Object.freeze(instance);

module.exports = instance;
