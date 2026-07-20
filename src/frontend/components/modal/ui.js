import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * Modal: se abre/cierra por eventos del bus (`modal:open`/`modal:close`) cuyo `target` coincide con su
 * `id`. El dispatcher convierte clicks en `[data-action="modal:open" data-target="<id>"]` en esos
 * eventos, así cualquier button abre este modal sin acoplarse a él. Estado en `data-open`.
 * @module modal.ui
 * @extends {UIComponentContract}
 */
export class Modal extends UIComponentContract {
  /**
   * Escucha eventos `modal:open`/`modal:close` del bus y tecla Escape.
   * @override
   */
  onMount() {
    this.id = this.element.id;
    this._onOpen = (p) => { if (p?.target === this.id) this.open(); };
    this._onClose = (p) => { if (p?.target === this.id) this.close(); };
    this.on('modal:open', this._onOpen);
    this.on('modal:close', this._onClose);
    // Escape cierra el modal abierto (el overlay ya cierra vía data-action → dispatcher).
    this._onKeydown = (e) => {
      if (e.key === 'Escape' && this.element.dataset.open === 'true') this.close();
    };
    document.addEventListener('keydown', this._onKeydown);
  }

  /**
   * Abre el modal: setea `data-open="true"` y emite `modal:opened`.
   */
  open() {
    this.element.dataset.open = 'true';
    this.emit('modal:opened', { id: this.id });
  }

  /**
   * Cierra el modal: setea `data-open="false"` y emite `modal:closed`.
   */
  close() {
    this.element.dataset.open = 'false';
    this.emit('modal:closed', { id: this.id });
  }

  /**
   * Limpia las suscripciones al bus y el listener de teclado.
   * @override
   */
  onDestroy() {
    this.off('modal:open', this._onOpen);
    this.off('modal:close', this._onClose);
    document.removeEventListener('keydown', this._onKeydown);
  }
}
