import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * Tooltip: controlador global delegado para elementos con el atributo `data-tooltip`.
 * Se posiciona automáticamente y evita solaparse con los bordes de la ventana.
 * En sidebar colapsado se posiciona al costado derecho centrado.
 * @module tooltip.ui
 * @extends {UIComponentContract}
 */
export class Tooltip extends UIComponentContract {
  /**
   * Escucha eventos globales `mouseover`/`mouseout` con delegación.
   * @override
   */
  onMount() {
    this._onMouseOver = (e) => {
      const trigger = e.target.closest?.('[data-tooltip]');
      if (trigger) {
        this.show(trigger);
      }
    };

    this._onMouseOut = (e) => {
      const trigger = e.target.closest?.('[data-tooltip]');
      if (trigger) {
        this.hide();
      }
    };

    document.addEventListener('mouseover', this._onMouseOver);
    document.addEventListener('mouseout', this._onMouseOut);
  }

  /**
   * Muestra el tooltip posicionado sobre (o al costado) del elemento trigger.
   * @param {HTMLElement} trigger - Elemento con atributo `data-tooltip`.
   */
  show(trigger) {
    if (trigger.closest('.c-sidebar:not(.c-sidebar--collapsed)')) {
      return;
    }

    const text = trigger.dataset.tooltip;
    if (!text) return;

    this.element.textContent = text;
    this.element.classList.add('c-tooltip--visible');

    const tooltipWidth = this.element.offsetWidth;
    const tooltipHeight = this.element.offsetHeight;

    const rect = trigger.getBoundingClientRect();
    const isSidebar = !!trigger.closest('.c-sidebar');
    let top, left;

    if (isSidebar) {
      // Posicionar al costado derecho centrado verticalmente
      top = rect.top + window.scrollY + (rect.height - tooltipHeight) / 2;
      left = rect.right + window.scrollX + 8;
    } else {
      // Posicionar arriba por defecto
      top = rect.top + window.scrollY - tooltipHeight - 8;
      left = rect.left + window.scrollX + (rect.width - tooltipWidth) / 2;

      if (left < 8) {
        left = 8;
      } else if (left + tooltipWidth > window.innerWidth - 8) {
        left = window.innerWidth - tooltipWidth - 8;
      }

      if (top < window.scrollY) {
        top = rect.bottom + window.scrollY + 8;
      }
    }

    this.element.style.top = `${top}px`;
    this.element.style.left = `${left}px`;
  }

  /**
   * Oculta el tooltip.
   */
  hide() {
    this.element.classList.remove('c-tooltip--visible');
  }

  /**
   * Remueve los listeners globales de mouseover/mouseout.
   * @override
   */
  onDestroy() {
    document.removeEventListener('mouseover', this._onMouseOver);
    document.removeEventListener('mouseout', this._onMouseOut);
  }
}
