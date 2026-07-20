import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * ConfirmDialog: Controlador del diálogo de confirmación basado en promesas.
 * Escucha el evento `confirm:show` y abre el modal confirmando/cancelando la acción.
 * @module confirm-dialog.ui
 * @extends {UIComponentContract}
 */
export class ConfirmDialog extends UIComponentContract {
  /**
   * Inicializa referencias a elementos del modal y suscriptores del bus.
   * Escucha `confirm:show` y `modal:closed`.
   * @override
   */
  onMount() {
    this.modal = this.element.querySelector('.c-modal');
    if (!this.modal) return;
    
    this.modalId = this.modal.id;
    this.titleEl = this.element.querySelector('.c-modal__title');
    this.messageEl = this.element.querySelector('.c-confirm-dialog__message');
    this.confirmBtn = this.element.querySelector('.c-confirm-dialog__btn-confirm');
    this.cancelBtn = this.element.querySelector('.c-confirm-dialog__btn-cancel');

    this.pendingResolve = null;

    this._onShow = (payload) => {
      this.show(payload);
    };

    this._onModalClosed = (payload) => {
      if (payload?.id === this.modalId && this.pendingResolve) {
        this.resolve(false);
      }
    };

    this._onConfirmClick = () => {
      this.resolve(true);
    };

    this._onCancelClick = () => {
      this.resolve(false);
    };

    this.on('confirm:show', this._onShow);
    this.on('modal:closed', this._onModalClosed);

    if (this.confirmBtn) {
      this.confirmBtn.addEventListener('click', this._onConfirmClick);
    }
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', this._onCancelClick);
    }
  }

  /**
   * Abre el diálogo de confirmación con título, mensaje, variante de color y resolve.
   * @param {Object} payload - Configuración del diálogo.
   * @param {string} [payload.title='Confirmar acción'] - Título del modal.
   * @param {string} [payload.message='¿Está seguro de continuar?'] - Mensaje de confirmación.
   * @param {string} [payload.confirmLabel='Confirmar'] - Texto del botón de confirmación.
   * @param {string} [payload.cancelLabel='Cancelar'] - Texto del botón de cancelación.
   * @param {'primary'|'danger'|'warning'} [payload.variant='primary'] - Variante visual.
   * @param {Function} [payload.resolve] - Función callback a invocar con true/false al confirmar/cancelar.
   */
  show(payload) {
    const {
      title = 'Confirmar acción',
      message = '¿Está seguro de continuar?',
      confirmLabel = 'Confirmar',
      cancelLabel = 'Cancelar',
      variant = 'primary', // primary | danger | warning
      resolve
    } = payload || {};

    this.pendingResolve = resolve;

    if (this.titleEl) this.titleEl.textContent = title;
    if (this.messageEl) this.messageEl.textContent = message;
    if (this.confirmBtn) this.confirmBtn.textContent = confirmLabel;
    if (this.cancelBtn) this.cancelBtn.textContent = cancelLabel;

    if (this.confirmBtn) {
      this.confirmBtn.className = 'c-button c-confirm-dialog__btn-confirm';
      if (variant === 'danger') {
        this.confirmBtn.classList.add('c-button--danger');
      } else if (variant === 'warning') {
        this.confirmBtn.classList.add('c-button--warning');
      } else {
        this.confirmBtn.classList.add('c-button--primary');
      }
    }

    this.emit('modal:open', { target: this.modalId });
  }

  /**
   * Resuelve la promesa pendiente y emite el cierre del modal.
   * @param {boolean} value - Resultado de la confirmación.
   */
  resolve(value) {
    if (this.pendingResolve) {
      this.pendingResolve(value);
      this.pendingResolve = null;
    }
    this.emit('modal:close', { target: this.modalId });
  }

  /**
   * Limpia todos los listeners del bus y del DOM.
   * @override
   */
  onDestroy() {
    this.off('confirm:show', this._onShow);
    this.off('modal:closed', this._onModalClosed);
    if (this.confirmBtn) {
      this.confirmBtn.removeEventListener('click', this._onConfirmClick);
    }
    if (this.cancelBtn) {
      this.cancelBtn.removeEventListener('click', this._onCancelClick);
    }
  }
}
