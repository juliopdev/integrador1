import { bus } from '../lib/bus.js';

/**
 * Contrato base de los componentes con comportamiento (`ui.js`). Formaliza el ciclo de vida y el
 * acceso al Event Bus. El estado vive en atributos `data-*` del nodo (no hay virtual DOM):
 * el SCSS reacciona al `data-*` y el JS lo muta. Ver components.md.
 */
export class UIComponentContract {
  /**
   * @param {HTMLElement} element - Nodo DOM que contiene el componente.
   */
  constructor(element) {
    this.element = element;
  }

  /**
   * Hook de montaje — las subclases lo sobrescriben para cachear selectores y enlazar listeners.
   * No-op por defecto.
   * @abstract
   */
  onMount() {}

  /**
   * Hook de destrucción — las subclases lo sobrescriben para desvincular todos los listeners.
   * No-op por defecto.
   * @abstract
   */
  onDestroy() {}

  /**
   * Inicializa el componente en el DOM invocando `onMount()`.
   * @returns {UIComponentContract} La misma instancia para encadenamiento.
   */
  mount() {
    this.onMount();
    return this;
  }

  /**
   * Destruye el componente y limpia sus listeners invocando `onDestroy()`.
   */
  destroy() {
    this.onDestroy();
  }

  /**
   * Emite un evento al bus global (comunicación desacoplada entre componentes).
   * @param {string} type - Nombre del evento.
   * @param {*} [payload] - Datos asociados al evento.
   */
  emit(type, payload) {
    bus.emit(type, payload);
  }

  /**
   * Se suscribe a un evento del bus global.
   * @param {string} type - Nombre del evento.
   * @param {Function} handler - Callback que manejará el evento.
   */
  on(type, handler) {
    bus.on(type, handler);
  }

  /**
   * Cancela una suscripción del bus global. Debe invocarse en `onDestroy()`.
   * @param {string} type - Nombre del evento.
   * @param {Function} handler - Referencia al mismo handler usado en `on()`.
   */
  off(type, handler) {
    bus.off(type, handler);
  }
}
