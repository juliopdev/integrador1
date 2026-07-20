import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * Textarea: limpia el estado de error al escribir y actualiza el contador de caracteres reactivamente.
 * Muestra advertencia al 85% y error al 100% del límite.
 * @module textarea.ui
 * @extends {UIComponentContract}
 */
export class Textarea extends UIComponentContract {
  /**
   * Obtiene referencias al campo, error y contador; registra el listener de input.
   * @override
   */
  onMount() {
    this.field = this.element.querySelector('.c-input__field--textarea');
    this.errorEl = this.element.querySelector('.c-input__error');
    this.counterEl = this.element.querySelector('.c-input__counter');
    
    if (!this.field) return;

    this._onInput = () => {
      this.clearError();
      this.updateCounter();
    };

    this.field.addEventListener('input', this._onInput);
    this.updateCounter();
  }

  /**
   * Limpia el estado de error del textarea.
   */
  clearError() {
    if (this.element.dataset.invalid !== 'true') return;
    this.element.dataset.invalid = 'false';
    if (this.errorEl) this.errorEl.textContent = '';
  }

  /**
   * Actualiza el contador de caracteres y los estados de warning/error según el porcentaje de uso.
   */
  updateCounter() {
    if (!this.counterEl) return;
    const currentLength = this.field.value.length;
    const maxLength = parseInt(this.counterEl.dataset.max || '0', 10);
    this.counterEl.textContent = `${currentLength} / ${maxLength}`;
    this.counterEl.dataset.count = String(currentLength);

    if (maxLength > 0) {
      const percentage = currentLength / maxLength;
      if (percentage >= 1.0) {
        this.counterEl.dataset.error = 'true';
        this.counterEl.dataset.warning = 'false';
      } else if (percentage >= 0.85) {
        this.counterEl.dataset.error = 'false';
        this.counterEl.dataset.warning = 'true';
      } else {
        this.counterEl.dataset.error = 'false';
        this.counterEl.dataset.warning = 'false';
      }
    }
  }

  /**
   * Remueve el listener de input.
   * @override
   */
  onDestroy() {
    if (this.field && this._onInput) this.field.removeEventListener('input', this._onInput);
  }
}
