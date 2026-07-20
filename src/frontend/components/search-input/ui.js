import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * SearchInput: maneja la entrada de búsqueda con debounce, spinner de carga y emisión al bus.
 * Emite `search:query` con el término de búsqueda tras el tiempo de debounce configurable.
 * @module search-input.ui
 * @extends {UIComponentContract}
 */
export class SearchInput extends UIComponentContract {
  /**
   * Configura el campo de búsqueda, botón de limpiar y sincroniza el estado inicial del botón clear.
   * @override
   */
  onMount() {
    this.field = this.element.querySelector('.c-search-input__field');
    this.clearBtn = this.element.querySelector('.c-search-input__clear');

    if (!this.field) return;

    this.debounceMs = parseInt(this.field.dataset.debounce || '300', 10);
    this.timeoutId = null;

    this._onInput = () => {
      this.handleInput();
    };

    this._onClearClick = () => {
      this.clearSearch();
    };

    this.field.addEventListener('input', this._onInput);
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', this._onClearClick);
    }

    this.syncClearButton();
  }

  /**
   * Procesa la entrada del usuario con debounce y emite la búsqueda.
   */
  handleInput() {
    this.syncClearButton();

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const query = this.field.value.trim();
    this.timeoutId = setTimeout(() => {
      this.triggerSearch(query);
    }, this.debounceMs);
  }

  /**
   * Limpia el campo de búsqueda, enfoca el input y emite búsqueda vacía.
   */
  clearSearch() {
    this.field.value = '';
    this.syncClearButton();
    this.field.focus();

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    this.triggerSearch('');
  }

  /**
   * Muestra u oculta el botón de limpiar según si el campo tiene valor.
   */
  syncClearButton() {
    const hasValue = this.field.value.length > 0;
    this.element.classList.toggle('c-search-input--has-value', hasValue);
  }

  /**
   * Emite el evento `search:query` y muestra el spinner de carga temporalmente.
   * @param {string} query - Término de búsqueda.
   */
  triggerSearch(query) {
    this.element.dataset.state = 'loading';
    this.emit('search:query', { name: this.field.name, query });
    
    setTimeout(() => {
      this.element.dataset.state = 'idle';
    }, 400);
  }

  /**
   * Limpia listeners y timeout de debounce.
   * @override
   */
  onDestroy() {
    if (this.field) {
      this.field.removeEventListener('input', this._onInput);
    }
    if (this.clearBtn) {
      this.clearBtn.removeEventListener('click', this._onClearClick);
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}
