import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * Tabs: controlador para la conmutación de paneles de contenido reactivo.
 * Emite `tabs:select` al cambiar de pestaña.
 * @module tabs.ui
 * @extends {UIComponentContract}
 */
export class Tabs extends UIComponentContract {
  /**
   * Busca las pestañas, registra el listener y sincroniza el panel activo inicial.
   * @override
   */
  onMount() {
    this.tabs = Array.from(this.element.querySelectorAll('.c-tabs__tab'));
    if (this.tabs.length === 0) return;

    this._onTabClick = (e) => {
      const tab = e.target.closest('.c-tabs__tab');
      if (tab) {
        this.selectTab(tab);
      }
    };

    this.element.addEventListener('click', this._onTabClick);

    const activeTab = this.tabs.find(t => t.classList.contains('c-tabs__tab--active')) || this.tabs[0];
    if (activeTab) {
      this.syncPanels(activeTab.dataset.targetPanel);
    }
  }

  /**
   * Activa una pestaña, sincroniza los paneles y emite el evento de cambio.
   * @param {HTMLElement} selectedTab - Elemento de la pestaña a seleccionar.
   */
  selectTab(selectedTab) {
    this.tabs.forEach(tab => {
      const isCurrent = tab === selectedTab;
      tab.classList.toggle('c-tabs__tab--active', isCurrent);
      tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    const panelId = selectedTab.dataset.targetPanel;
    this.syncPanels(panelId);
    
    this.emit('tabs:select', { id: this.element.id, tabId: panelId });
  }

  /**
   * Muestra el panel activo y oculta los demás según el atributo `data-tab-panel`.
   * @param {string} activePanelId - ID del panel a mostrar.
   */
  syncPanels(activePanelId) {
    if (!activePanelId) return;
    document.querySelectorAll('[data-tab-panel]').forEach(panel => {
      const isCurrent = panel.dataset.tabPanel === activePanelId;
      if (isCurrent) {
        panel.style.display = '';
        panel.removeAttribute('hidden');
      } else {
        panel.style.display = 'none';
        panel.setAttribute('hidden', 'true');
      }
    });
  }

  /**
   * Remueve el listener de click.
   * @override
   */
  onDestroy() {
    this.element.removeEventListener('click', this._onTabClick);
  }
}
