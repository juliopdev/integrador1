import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * Form: intercepta el submit, envía el body como JSON al `action`, y maneja la respuesta según el
 * contrato (`{ data }` en 2xx; `{ code, message }` en error). En éxito redirige a `data-redirect`
 * (si existe) y emite `form:success`; en error lanza un toast y emite `form:error`. Refleja el estado
 * de carga en el botón submit vía `data-state`. Ver components.md y errors.md.
 * @module form.ui
 * @extends {UIComponentContract}
 */
export class Form extends UIComponentContract {
  /**
   * Configura listeners de submit, autosubmit y validación inicial de campos requeridos.
   * @override
   */
  onMount() {
    this._onSubmit = (event) => this.submit(event);
    this.element.addEventListener('submit', this._onSubmit);
    // P7.2: `data-autosubmit` envía el form en cada `change` (switches/checkboxes sin botón).
    if (this.element.dataset.autosubmit !== undefined) {
      this._onChange = () => this.element.requestSubmit();
      this.element.addEventListener('change', this._onChange);
    }
    this._bindSubmitValidation();
  }

  /**
   * Vincula la validación de campos requeridos para habilitar/deshabilitar el botón submit.
   * @private
   */
  _bindSubmitValidation() {
    const submitBtn = this.element.querySelector('[type="submit"]');
    if (!submitBtn || !submitBtn.disabled) return;
    this._validateSubmitEnabled();
    const handler = () => this._validateSubmitEnabled();
    this.element.addEventListener('input', handler);
    this.element.addEventListener('change', handler);
    this._onValidation = handler;
  }

  /**
   * Verifica si todos los campos requeridos están completos y actualiza el estado del botón submit.
   * @private
   */
  _validateSubmitEnabled() {
    const submitBtn = this.element.querySelector('[type="submit"]');
    if (!submitBtn) return;
    const requiredFields = this.element.querySelectorAll('[required]');
    const allFilled = requiredFields.length > 0 && Array.from(requiredFields).every((el) => {
      if (el.tagName === 'SELECT') return el.value !== '';
      return el.value.trim() !== '';
    });
    submitBtn.disabled = !allFilled;
  }

  /**
   * Limpia los estados de error de todos los campos del formulario.
   */
  clearAllErrors() {
    this.element.querySelectorAll('.c-input').forEach((inputContainer) => {
      inputContainer.dataset.invalid = 'false';
      const errorEl = inputContainer.querySelector('.c-input__error');
      if (errorEl) errorEl.textContent = '';
    });
  }

  /**
   * Procesa el submit del formulario: envía JSON o FormData según el case, maneja errores y conflictos.
   * Emite `form:success`, `form:error`, `form:conflict` y `toast` según el resultado.
   * @param {Event} event - Evento de submit.
   * @returns {Promise<void>}
   */
   async submit(event) {
    event.preventDefault();
    this.clearAllErrors();
    // Iter 32 E/F: si el form declara `data-confirm="mensaje"`, mostramos un prompt nativo antes
    // de disparar la acción. Cancelar aborta el submit sin tocar estado ni emitir eventos.
    const confirmMsg = this.element.dataset.confirm;
    if (confirmMsg && typeof window !== 'undefined' && !window.confirm(confirmMsg)) return;
    const submitBtn = this.element.querySelector('[type="submit"]');
    // Iter 2026-07: swap del label mientras dura la operación. Si el botón declara
    // `data-loading-label="…"`, guardamos el label original y lo reemplazamos por el de loading.
    // El pseudo-elemento spinner (button/_ui.scss) sigue apareciendo por el `data-state`. Ver
    // components.md §3.
    let originalLabel = null;
    let labelEl = null;
    if (submitBtn) {
      submitBtn.dataset.state = 'loading';
      submitBtn.disabled = true; // Evita clicks múltiples durante la operación
      const loadingLabel = submitBtn.dataset.loadingLabel;
      if (loadingLabel) {
        labelEl = submitBtn.querySelector('.c-button__label');
        if (labelEl) {
          originalLabel = labelEl.textContent;
          labelEl.textContent = loadingLabel;
        }
      }
    }

    // Los navegadores normalizan `<form method>` a GET/POST — para PUT/DELETE se usa
    // `data-method="put"|"delete"` en el `<form>`. Con `data-method="delete"` se puede omitir el
    // body por completo (el server ignora payload en DELETE).
    const method = (this.element.dataset.method || 'POST').toUpperCase();
    const isMultipart = (this.element.enctype === 'multipart/form-data');
    let shouldResetBtn = true;

    try {
      const init = { method };
      if (method !== 'GET' && method !== 'DELETE') {
        if (isMultipart) {
          // Enviar FormData nativo — el navegador configura el boundary automáticamente.
          // NO setear content-type manualmente: fetch lo genera con el boundary correcto.
          init.body = new FormData(this.element);
        } else {
          // El header json va SOLO con body: en GET/DELETE (sin body) Fastify rechaza
          // `content-type: application/json` vacío con 400 FST_ERR_CTP_EMPTY_JSON_BODY.
          const payload = expandDotted(collectFormData(this.element));
          init.headers = { 'content-type': 'application/json' };
          init.body = JSON.stringify(payload);
        }
      }
      const res = await fetch(this.element.action, init);
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        this.emit('form:success', { data: body.data ?? null });
        const redirect = this.element.dataset.redirect;
        if (redirect) {
          shouldResetBtn = false; // No restaurar el botón si redirigimos para no parpadear/permitir clicks
          window.location.assign(redirect);
          return;
        }
      } else {
        // Errores "conflict" (details.dependencies presente) son resolubles por confirmación del
        // operador (ej. `PROVIDER_IN_USE_BY_DRAFT` reintentado con `force: true`). El bus consumer
        // decide qué modal/prompt mostrar — no toast automático para no duplicar la comunicación.
        if (body.details?.dependencies) {
          this.emit('form:conflict', {
            code: body.code,
            message: body.message,
            details: body.details,
            url: this.element.action,
            method,
            redirect: this.element.dataset.redirect || null,
          });
          return;
        }
        if (body.details) {
          for (const [fieldName, messages] of Object.entries(body.details)) {
            const inputContainer = this.element.querySelector(`[name="${fieldName}"]`)?.closest('.c-input');
            if (inputContainer) {
              inputContainer.dataset.invalid = 'true';
              const errorEl = inputContainer.querySelector('.c-input__error');
              if (errorEl) {
                errorEl.textContent = Array.isArray(messages) ? messages[0] : String(messages);
              }
            }
          }
        }
        this.emit('toast', { variant: 'error', message: body.message || 'Ocurrió un error.' });
        this.emit('form:error', { code: body.code, message: body.message });
      }
    } catch {
      this.emit('toast', { variant: 'error', message: 'No se pudo conectar con el servidor.' });
    } finally {
      if (shouldResetBtn && submitBtn) {
        submitBtn.dataset.state = 'idle';
        submitBtn.disabled = false;
        if (labelEl && originalLabel !== null) labelEl.textContent = originalLabel;
      }
    }
  }

  /**
   * Limpia todos los listeners de submit, change y validación.
   * @override
   */
  onDestroy() {
    this.element.removeEventListener('submit', this._onSubmit);
    if (this._onChange) this.element.removeEventListener('change', this._onChange);
    if (this._onValidation) {
      this.element.removeEventListener('input', this._onValidation);
      this.element.removeEventListener('change', this._onValidation);
    }
  }
}

/**
 * Recolecta el contenido del `<form>` respetando **claves repetidas** (múltiples checkboxes con
 * el mismo `name`, `<select multiple>`, etc.). Cuando una clave aparece más de una vez, el valor
 * pasa a ser un array. `Object.fromEntries(FormData.entries())` se queda solo con el último —
 * este helper preserva todos, que es lo que necesitan los toggles/selects múltiples.
 */
/**
 * Recolecta el contenido del `<form>` respetando claves repetidas (múltiples checkboxes, select múltiple).
 * A diferencia de `Object.fromEntries`, preserva todos los valores bajo una misma clave como un array.
 * @param {HTMLFormElement} formEl - Elemento del formulario.
 * @returns {Object.<string, string|string[]>} Objeto plano con los valores del formulario.
 * @example
 * // Para <input name="role" value="admin"> y <input name="role" value="user">
 * collectFormData(form) // Devuelve { role: ['admin', 'user'] }
 */
export function collectFormData(formEl) {
  const acc = {};
  for (const [key, value] of new FormData(formEl).entries()) {
    if (acc[key] === undefined) {
      acc[key] = value;
    } else if (Array.isArray(acc[key])) {
      acc[key].push(value);
    } else {
      acc[key] = [acc[key], value];
    }
  }
  return acc;
}

/**
 * Expande claves con notación de punto (`config.uri`) a objetos anidados (`{ config: { uri } }`).
 * Necesario porque los endpoints (ej. `POST /providers`) esperan `{ category, provider, config }` y
 * los `FormData.entries()` son planos. Idempotente sobre claves sin punto.
 */
/**
 * Expande claves con notación de punto (`config.uri`) a objetos anidados (`{ config: { uri } }`).
 * Idempotente sobre claves sin punto.
 * @param {Object.<string, *>} flat - Objeto plano con posibles claves punteadas.
 * @returns {Object.<string, *>} Objeto anidado expandido.
 * @example
 * expandDotted({ 'config.uri': '/api', name: 'test' })
 * // Devuelve { config: { uri: '/api' }, name: 'test' }
 */
export function expandDotted(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!key.includes('.')) {
      out[key] = value;
      continue;
    }
    const parts = key.split('.');
    let cursor = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cursor[p] == null || typeof cursor[p] !== 'object') cursor[p] = {};
      cursor = cursor[p];
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return out;
}
