import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * Input: limpia el estado de error en cuanto el usuario escribe y maneja la visibilidad de contraseña.
 * @module input.ui
 * @extends {UIComponentContract}
 */
export class Input extends UIComponentContract {
  /**
   * Configura el listener de input para limpiar errores y el toggle de visibilidad de contraseña.
   * @override
   */
  onMount() {
    this.field = this.element.querySelector('.c-input__field');
    this.errorEl = this.element.querySelector('.c-input__error');
    if (!this.field) return;

    this._onInput = () => this.clearError();
    this.field.addEventListener('input', this._onInput);

    // Toggle de visibilidad de contraseña
    this.passwordToggle = this.element.querySelector('.c-input__password-toggle');
    if (this.passwordToggle) {
      this._onTogglePassword = () => {
        const isPassword = this.field.type === 'password';
        this.field.type = isPassword ? 'text' : 'password';
        this.passwordToggle.setAttribute('aria-pressed', !isPassword);
        this.passwordToggle.classList.toggle('c-input__password-toggle--visible', !isPassword);
      };
      this.passwordToggle.addEventListener('click', this._onTogglePassword);
    }
  }

  /**
   * Limpia el estado de error del campo.
   */
  clearError() {
    if (this.element.dataset.invalid !== 'true') return;
    this.element.dataset.invalid = 'false';
    if (this.errorEl) this.errorEl.innerHTML = '';
  }

  /**
   * Remueve listeners de input y password toggle.
   * @override
   */
  onDestroy() {
    if (this.field && this._onInput) this.field.removeEventListener('input', this._onInput);
    if (this.passwordToggle && this._onTogglePassword) {
      this.passwordToggle.removeEventListener('click', this._onTogglePassword);
    }
  }
}
