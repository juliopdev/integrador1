import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * CopyButton: copia texto al portapapeles utilizando la API del portapapeles y cambia a estado de éxito.
 * Usa `navigator.clipboard` con fallback a `document.execCommand('copy')`.
 * @module copy-button.ui
 * @extends {UIComponentContract}
 */
export class CopyButton extends UIComponentContract {
  /**
   * Escucha el click en el elemento para disparar la copia.
   * @override
   */
  onMount() {
    this._onCopyClick = () => {
      this.copy();
    };
    this.element.addEventListener('click', this._onCopyClick);
    this.timeoutId = null;
  }

  /**
   * Copia el contenido de `data-copy` al portapapeles y emite notificaciones.
   * @returns {Promise<void>}
   * @throws {Error} Si no se pudo copiar el texto (capturado internamente).
   */
  async copy() {
    const text = this.element.dataset.copy || '';
    if (!text) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'absolute';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      this.element.dataset.state = 'copied';
      this.emit('toast', { variant: 'success', message: 'Copiado al portapapeles' });

      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }

      this.timeoutId = setTimeout(() => {
        this.element.dataset.state = 'idle';
      }, 2000);

    } catch (err) {
      this.emit('toast', { variant: 'error', message: 'No se pudo copiar el texto.' });
    }
  }

  /**
   * Limpia el listener y el timeout pendiente.
   * @override
   */
  onDestroy() {
    this.element.removeEventListener('click', this._onCopyClick);
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}
