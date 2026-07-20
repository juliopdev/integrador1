import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * Select: controlador para el dropdown personalizado con buscador y navegación por teclado.
 * Soporta filtrado de opciones, selección por teclado (ArrowUp/Down/Enter/Escape) y accesibilidad.
 * @module select.ui
 * @extends {UIComponentContract}
 */
export class Select extends UIComponentContract {
  /**
   * Inicializa referencias a los elementos del custom select y registra todos los listeners.
   * @override
   */
  onMount() {
    this.nativeSelect = this.element.querySelector('.c-select__native');
    this.trigger = this.element.querySelector('.c-select__trigger');
    this.triggerLabel = this.element.querySelector('.c-select__trigger-label');
    this.dropdown = this.element.querySelector('.c-select__dropdown');
    this.searchField = this.element.querySelector('.c-select__search');
    this.errorEl = this.element.querySelector('.c-input__error');
    this.options = Array.from(this.element.querySelectorAll('.c-select__option'));

    if (!this.trigger || !this.nativeSelect) return;

    this._onTriggerClick = (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    };

    this._onOutsideClick = (e) => {
      if (!this.element.contains(e.target)) {
        this.closeDropdown();
      }
    };

    this._onOptionClick = (e) => {
      const optionEl = e.target.closest('.c-select__option');
      if (optionEl) {
        this.selectOption(optionEl);
      }
    };

    this._onSearchInput = () => {
      this.filterOptions();
    };

    this._onKeyDown = (e) => {
      this.handleKeyDown(e);
    };

    this.trigger.addEventListener('click', this._onTriggerClick);
    document.addEventListener('click', this._onOutsideClick);
    if (this.dropdown) {
      this.dropdown.addEventListener('click', this._onOptionClick);
    }
    if (this.searchField) {
      this.searchField.addEventListener('input', this._onSearchInput);
    }
    this.element.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Alterna la apertura/cierre del dropdown.
   */
  toggleDropdown() {
    if (this.element.dataset.disabled === 'true') return;
    const isOpen = this.element.dataset.open === 'true';
    if (isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  /**
   * Abre el dropdown y enfoca el campo de búsqueda o la opción seleccionada.
   */
  openDropdown() {
    this.element.dataset.open = 'true';
    this.trigger.setAttribute('aria-expanded', 'true');
    
    if (this.searchField) {
      this.searchField.tabIndex = 0;
      this.searchField.focus();
    } else {
      const selected = this.element.querySelector('.c-select__option--selected');
      if (selected) {
        selected.tabIndex = 0;
        selected.focus();
      }
    }
  }

  /**
   * Cierra el dropdown, restaura el foco al trigger y limpia el filtro de búsqueda.
   */
  closeDropdown() {
    if (this.element.dataset.open !== 'true') return;
    this.element.dataset.open = 'false';
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.focus();

    if (this.searchField) {
      this.searchField.tabIndex = -1;
      this.searchField.value = '';
      this.filterOptions();
    }
  }

  /**
   * Selecciona una opción, actualiza el native select y limpia errores.
   * @param {HTMLElement} optionEl - Elemento de la opción seleccionada.
   */
  selectOption(optionEl) {
    const val = optionEl.dataset.value;
    const label = optionEl.textContent.trim();

    this.nativeSelect.value = val;
    this.nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    this.triggerLabel.textContent = label;
    this.options.forEach(opt => {
      const isSel = opt === optionEl;
      opt.classList.toggle('c-select__option--selected', isSel);
      opt.setAttribute('aria-selected', isSel ? 'true' : 'false');
    });

    this.closeDropdown();
    this.clearError();
  }

  /**
   * Filtra las opciones visibles según el texto ingresado en el buscador.
   */
  filterOptions() {
    if (!this.searchField) return;
    const query = this.searchField.value.toLowerCase().trim();
    this.options.forEach(opt => {
      const text = opt.textContent.toLowerCase();
      const match = text.includes(query);
      opt.classList.toggle('c-select__option--hidden', !match);
    });
  }

  /**
   * Limpia el estado de error del select.
   */
  clearError() {
    if (this.element.dataset.invalid !== 'true') return;
    this.element.dataset.invalid = 'false';
    if (this.errorEl) this.errorEl.textContent = '';
  }

  /**
   * Maneja eventos de teclado: Escape cierra, Enter/Space abre, ArrowUp/Down navega opciones.
   * @param {KeyboardEvent} e - Evento de teclado.
   */
  handleKeyDown(e) {
    const isOpen = this.element.dataset.open === 'true';

    if (e.key === 'Escape') {
      this.closeDropdown();
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      if (!isOpen && document.activeElement === this.trigger) {
        this.openDropdown();
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!isOpen) {
        this.openDropdown();
        e.preventDefault();
        return;
      }

      const visibleOpts = this.options.filter(opt => !opt.classList.contains('c-select__option--hidden'));
      if (visibleOpts.length === 0) return;

      const activeIdx = visibleOpts.indexOf(document.activeElement);
      let nextIdx = activeIdx;

      if (e.key === 'ArrowDown') {
        nextIdx = activeIdx + 1 < visibleOpts.length ? activeIdx + 1 : 0;
      } else {
        nextIdx = activeIdx - 1 >= 0 ? activeIdx - 1 : visibleOpts.length - 1;
      }

      visibleOpts[nextIdx].tabIndex = 0;
      visibleOpts[nextIdx].focus();
      
      visibleOpts.forEach((opt, idx) => {
        if (idx !== nextIdx) opt.removeAttribute('tabindex');
      });

      e.preventDefault();
    }
  }

  /**
   * Limpia todos los listeners del custom select.
   * @override
   */
  onDestroy() {
    if (this.trigger) this.trigger.removeEventListener('click', this._onTriggerClick);
    document.removeEventListener('click', this._onOutsideClick);
    if (this.dropdown) this.dropdown.removeEventListener('click', this._onOptionClick);
    if (this.searchField) this.searchField.removeEventListener('input', this._onSearchInput);
    this.element.removeEventListener('keydown', this._onKeyDown);
  }
}
