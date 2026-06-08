/**
 * ES: Bus de eventos en memoria compatible con la interfaz de 'mitt'.
 * Permite la intercomunicación desacoplada entre componentes del lado del cliente.
 * 
 * EN: In-memory event bus compatible with 'mitt' interface.
 * Allows decoupled communication between client-side components.
 */
export default class InMemoryEventBus {
  constructor() {
    this.all = new Map();
  }

  /**
   * ES: Registra un manejador para un tipo de evento.
   * @param {string} type - Tipo de evento, o '*' para todos los eventos.
   * @param {Function} handler - Callback que se ejecuta al gatillarse el evento.
   */
  on(type, handler) {
    let handlers = this.all.get(type);
    if (!handlers) {
      handlers = [];
      this.all.set(type, handlers);
    }
    handlers.push(handler);
  }

  /**
   * ES: Remueve un manejador de evento.
   * @param {string} type - Tipo de evento.
   * @param {Function} [handler] - El manejador a remover (si se omite, remueve todos).
   */
  off(type, handler) {
    const handlers = this.all.get(type);
    if (handlers) {
      if (handler) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      } else {
        this.all.set(type, []);
      }
    }
  }

  /**
   * ES: Despacha un evento a todos los escuchadores.
   * @param {string} type - Tipo de evento.
   * @param {*} [evt] - Payload del evento.
   */
  emit(type, evt) {
    const handlers = this.all.get(type);
    if (handlers) {
      handlers.slice().forEach((handler) => {
        handler(evt);
      });
    }
    const globalHandlers = this.all.get('*');
    if (globalHandlers) {
      globalHandlers.slice().forEach((handler) => {
        handler(type, evt);
      });
    }
  }
}
