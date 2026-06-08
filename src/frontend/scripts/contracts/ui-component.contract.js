/**
 * ES: Contrato (Interfaz abstracta) para todos los componentes de interfaz de usuario.
 * Estandariza el ciclo de vida de montaje y desmontaje en el cliente.
 * 
 * EN: Contract (Abstract Interface) for all UI components.
 * Standardizes client-side mounting and destruction lifecycles.
 */
export default class UIComponentContract {
  /**
   * @param {HTMLElement} element - El elemento del DOM asociado al componente.
   * @param {object} eventBus - El bus de eventos en memoria.
   * @param {object} options - Opciones de configuración adicionales.
   */
  constructor(element, eventBus, options = {}) {
    if (new.target === UIComponentContract) {
      throw new TypeError("Cannot construct UIComponentContract instances directly");
    }
    this.element = element;
    this.eventBus = eventBus;
    this.options = options;
  }

  /**
   * ES: Inicializa el componente (añade listeners, monta elementos, etc.).
   */
  mount() {
    throw new Error("Method 'mount()' must be implemented.");
  }

  /**
   * ES: Limpia recursos (remueve listeners, cancela timers, etc.).
   */
  destroy() {
    throw new Error("Method 'destroy()' must be implemented.");
  }
}
