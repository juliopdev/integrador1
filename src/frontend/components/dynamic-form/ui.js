import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * DynamicForm: orquesta la validación reactiva y serialización de formularios dinámicos.
 * Emite el evento `dynamic-form:submit` con los datos serializados al hacer submit.
 * @module dynamic-form.ui
 * @extends {UIComponentContract}
 */
export class DynamicForm extends UIComponentContract {
  /**
   * Escucha el evento submit del formulario.
   * @override
   */
  onMount() {
    this.resourceName = this.element.dataset.resource;
    this.errorEl = this.element.querySelector('.c-dynamic-form__error');

    this._onSubmit = (e) => {
      this.handleSubmit(e);
    };

    this.element.addEventListener('submit', this._onSubmit);
  }

  /**
   * Valida campos requeridos, serializa el formulario y emite `dynamic-form:submit`.
   * @param {Event} e - Evento de submit del formulario.
   */
  handleSubmit(e) {
    e.preventDefault();
    if (this.errorEl) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
    }

    let isValid = true;

    const inputs = this.element.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      const isRequired = input.hasAttribute('required');
      const isEmpty = input.value.trim() === '';
      const wrapper = input.closest('.c-input') || input.closest('.c-textarea');

      if (isRequired && isEmpty) {
        isValid = false;
        if (wrapper) {
          wrapper.setAttribute('data-state', 'invalid');
          const helper = wrapper.querySelector('.c-input__helper, .c-textarea__helper');
          if (helper) {
            helper.textContent = 'Este campo es obligatorio.';
          }
        }
      } else {
        if (wrapper) {
          wrapper.removeAttribute('data-state');
        }
      }
    });

    if (!isValid) {
      if (this.errorEl) {
        this.errorEl.textContent = 'Por favor, completa todos los campos requeridos.';
        this.errorEl.hidden = false;
      }
      return;
    }

    const data = {};
    const formData = new FormData(this.element);
    for (let [key, val] of formData.entries()) {
      const input = this.element.querySelector(`[name="${key}"]`);
      if (input && input.type === 'number') {
        data[key] = val !== '' ? Number(val) : null;
      } else {
        data[key] = val;
      }
    }

    this.element.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      data[cb.name] = cb.checked;
    });

    this.emit('dynamic-form:submit', {
      resource: this.resourceName,
      data
    });
  }

  /**
   * Muestra un mensaje de error en el contenedor de errores del formulario.
   * @param {string} message - Texto del error a mostrar.
   */
  showError(message) {
    if (this.errorEl) {
      this.errorEl.textContent = message;
      this.errorEl.hidden = false;
    }
  }

  /**
   * Remueve el listener de submit.
   * @override
   */
  onDestroy() {
    this.element.removeEventListener('submit', this._onSubmit);
  }
}
