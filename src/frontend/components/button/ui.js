import UIComponentContract from '../../scripts/contracts/ui-component.contract.js';

/**
 * ES: Controlador de componente UI para botones.
 * Administra eventos click y los notifica en el bus de eventos global.
 */
export default class UIButtonComponent extends UIComponentContract {
  mount() {
    this.clickHandler = (e) => {
      this.eventBus.emit('ui:button:click', { 
        id: this.element.id, 
        element: this.element, 
        event: e 
      });
      if (this.options.onClick) {
        this.options.onClick(e);
      }
    };
    this.element.addEventListener('click', this.clickHandler);
  }

  destroy() {
    if (this.clickHandler) {
      this.element.removeEventListener('click', this.clickHandler);
    }
  }
}
