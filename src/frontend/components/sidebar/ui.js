import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

const STORAGE_KEY = 'ui.sidebar.collapsed';

/**
 * Sidebar (Iter 34): estado colapsado/expandido persistido en `localStorage`. Toggle vía botón
 * dentro del `<aside class="c-sidebar">` con `data-action="sidebar:toggle"`. Cuando está colapsado
 * los labels de cada `__link` se ocultan por CSS (`.c-sidebar--collapsed`), quedan solo los iconos
 * con `title=` como tooltip nativo.
 *
 * El estado inicial se aplica en el <html> en `dashboard.entry.js` para evitar flash (aplicar
 * durante `onMount()` del componente correría después del layout inicial).
 * @module sidebar.ui
 * @extends {UIComponentContract}
 */
export class Sidebar extends UIComponentContract {
  /**
   * Busca el botón de toggle y registra el listener de click.
   * @override
   */
  onMount() {
    this.toggleBtn = this.element.querySelector('[data-action="sidebar:toggle"]');
    if (!this.toggleBtn) return;
    this._onClick = () => this.toggle();
    this.toggleBtn.addEventListener('click', this._onClick);
  }

  /**
   * Alterna el estado colapsado/expandido del sidebar, persiste en localStorage y actualiza aria-expanded.
   */
  toggle() {
    const collapsed = this.element.classList.toggle('c-sidebar--collapsed');
    const grid = this.element.closest('.l-dashboard-grid');
    if (grid) grid.classList.toggle('l-dashboard-grid--collapsed', collapsed);
    try { window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* noop */ }
    this.toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  /**
   * Remueve el listener del botón de toggle.
   * @override
   */
  onDestroy() {
    if (this.toggleBtn && this._onClick) this.toggleBtn.removeEventListener('click', this._onClick);
  }
}

/**
 * Lee el estado guardado (sin tocar el DOM). Se usa en `dashboard.entry.js` para aplicar la clase
 * antes de que el sidebar se pinte y así evitar el flash de labels expandidos.
 */
/**
 * Lee el estado colapsado del sidebar desde localStorage sin tocar el DOM.
 * @returns {boolean} `true` si el sidebar debe estar colapsado.
 */
export function readSidebarCollapsed() {
  try { return window.localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}
