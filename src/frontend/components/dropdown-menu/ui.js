import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * DropdownMenu: controla la apertura, cierre y despacho de acciones de menús flotantes.
 * Se posiciona automáticamente respecto al trigger y cierra con click fuera o Escape.
 * @module dropdown-menu.ui
 * @extends {UIComponentContract}
 */
export class DropdownMenu extends UIComponentContract {
  /**
   * Registra listeners de trigger por data-target, click outside, teclado y clicks en items.
   * @override
   */
  onMount() {
    this.id = this.element.id;
    this.activeTrigger = null;
    if (!this.element.dataset.open) {
      this.element.dataset.open = 'false';
    }

    this._onTriggerClick = (e) => {
      const trigger = e.target.closest?.(`[data-target="${this.id}"]`);
      if (trigger) {
        e.stopPropagation();
        this.toggle(trigger);
      }
    };

    this._onOutsideClick = (e) => {
      if (!this.element.contains(e.target) && (!this.activeTrigger || !this.activeTrigger.contains(e.target))) {
        this.close();
      }
    };

    this._onKeydown = (e) => {
      if (e.key === 'Escape' && this.element.dataset.open === 'true') {
        this.close();
      }
    };

    this._onMenuClick = (e) => {
      const item = e.target.closest('.c-dropdown-menu__item');
      if (item && !item.disabled && !item.classList.contains('c-dropdown-menu__item--disabled')) {
        const action = item.dataset.action;
        if (action) {
          // Stop propagation para que el dispatcher global no re-emita el mismo action con distinto
          // payload — el DropdownMenu es la sola fuente del evento cuando se dispara desde un item.
          e.stopPropagation();
          this.emit(action, {
            dropdownId: this.id,
            trigger: this.activeTrigger,
            target: item.dataset.target ?? null,
          });
        }
        this.close();
      }
    };

    document.addEventListener('click', this._onTriggerClick);
    document.addEventListener('click', this._onOutsideClick);
    document.addEventListener('keydown', this._onKeydown);
    this.element.addEventListener('click', this._onMenuClick);
  }

  /**
   * Alterna el menú: lo abre si está cerrado o lo cierra si el trigger coincide.
   * @param {HTMLElement} trigger - Elemento que activa el menú.
   */
  toggle(trigger) {
    const isOpen = this.element.dataset.open === 'true';
    if (isOpen && this.activeTrigger === trigger) {
      this.close();
    } else {
      this.open(trigger);
    }
  }

  /**
   * Abre el menú y lo posiciona relativo al trigger.
   * @param {HTMLElement} trigger - Elemento que activa el menú.
   */
  open(trigger) {
    this.activeTrigger = trigger;
    this.element.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    this.position(trigger);
  }

  /**
   * Cierra el menú y actualiza el estado aria del trigger.
   */
  close() {
    if (this.element.dataset.open !== 'true') return;
    this.element.dataset.open = 'false';
    if (this.activeTrigger) {
      this.activeTrigger.setAttribute('aria-expanded', 'false');
      this.activeTrigger = null;
    }
  }

  /**
   * Posiciona el menú debajo del trigger, reajustando si se desborda de la ventana.
   * @param {HTMLElement} trigger - Elemento trigger usado como referencia de posición.
   */
  position(trigger) {
    this.element.style.display = 'block';
    const menuWidth = this.element.offsetWidth;
    const menuHeight = this.element.offsetHeight;
    this.element.style.display = '';

    const rect = trigger.getBoundingClientRect();
    
    let top = rect.bottom + window.scrollY + 4;
    let left = rect.left + window.scrollX;

    if (left + menuWidth > window.innerWidth - 8) {
      left = rect.right + window.scrollX - menuWidth;
    }

    if (top + menuHeight > window.scrollY + window.innerHeight - 8) {
      top = rect.top + window.scrollY - menuHeight - 4;
    }

    this.element.style.top = `${top}px`;
    this.element.style.left = `${left}px`;
  }

  /**
   * Limpia todos los listeners globales y del elemento.
   * @override
   */
  onDestroy() {
    document.removeEventListener('click', this._onTriggerClick);
    document.removeEventListener('click', this._onOutsideClick);
    document.removeEventListener('keydown', this._onKeydown);
    this.element.removeEventListener('click', this._onMenuClick);
  }
}
