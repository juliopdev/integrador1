import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * ContextMenu: controla la aparición del menú contextual sobre coordenadas del click derecho.
 * Escucha eventos `contextmenu` globalmente y se posiciona según la ubicación del clic.
 * @module context-menu.ui
 * @extends {UIComponentContract}
 */
export class ContextMenu extends UIComponentContract {
  /**
   * Registra listeners globales para contextmenu, click outside y teclado (Escape).
   * @override
   */
  onMount() {
    this.id = this.element.id;
    this.activeTrigger = null;
    if (!this.element.dataset.open) {
      this.element.dataset.open = 'false';
    }

    this._onContextMenu = (e) => {
      const trigger = e.target.closest(`[data-context-menu="${this.id}"]`);
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        this.open(e.clientX, e.clientY, trigger);
      }
    };

    this._onOutsideClick = (e) => {
      if (!this.element.contains(e.target)) {
        this.close();
      }
    };

    this._onKeydown = (e) => {
      if (e.key === 'Escape' && this.element.dataset.open === 'true') {
        this.close();
      }
    };

    this._onMenuClick = (e) => {
      const item = e.target.closest('.c-context-menu__item');
      if (item && !item.disabled) {
        const action = item.dataset.action;
        if (action) {
          this.emit(action, { contextMenuId: this.id, trigger: this.activeTrigger });
        }
        this.close();
      }
    };

    document.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('click', this._onOutsideClick);
    document.addEventListener('keydown', this._onKeydown);
    this.element.addEventListener('click', this._onMenuClick);
  }

  /**
   * Abre el menú contextual en las coordenadas dadas.
   * @param {number} clientX - Coordenada X del puntero.
   * @param {number} clientY - Coordenada Y del puntero.
   * @param {HTMLElement} trigger - Elemento que disparó el menú.
   */
  open(clientX, clientY, trigger) {
    this.activeTrigger = trigger;
    this.element.dataset.open = 'true';
    this.position(clientX, clientY);
  }

  /**
   * Cierra el menú contextual y limpia el trigger activo.
   */
  close() {
    if (this.element.dataset.open !== 'true') return;
    this.element.dataset.open = 'false';
    this.activeTrigger = null;
  }

  /**
   * Calcula y aplica la posición del menú evitando que se desborde de la ventana.
   * @param {number} clientX - Coordenada X del puntero.
   * @param {number} clientY - Coordenada Y del puntero.
   */
  position(clientX, clientY) {
    this.element.style.display = 'block';
    const menuWidth = this.element.offsetWidth;
    const menuHeight = this.element.offsetHeight;
    this.element.style.display = '';

    let top = clientY + window.scrollY;
    let left = clientX + window.scrollX;

    if (clientX + menuWidth > window.innerWidth - 8) {
      left = clientX + window.scrollX - menuWidth;
    }

    if (clientY + menuHeight > window.innerHeight - 8) {
      top = clientY + window.scrollY - menuHeight;
    }

    this.element.style.top = `${top}px`;
    this.element.style.left = `${left}px`;
  }

  /**
   * Elimina todos los listeners globales y del elemento.
   * @override
   */
  onDestroy() {
    document.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('click', this._onOutsideClick);
    document.removeEventListener('keydown', this._onKeydown);
    this.element.removeEventListener('click', this._onMenuClick);
  }
}
