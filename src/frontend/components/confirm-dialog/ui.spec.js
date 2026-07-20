// @vitest-environment jsdom
/**
 * Pruebas del componente ConfirmDialog.
 * Verifica apertura, confirmación, cancelación y callback de resultados.
 *
 * @module ConfirmDialogSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <div class="c-confirm-dialog-wrapper">
      <div class="c-modal" id="confirm-dialog" data-open="false">
        <h3 class="c-modal__title">Title</h3>
        <p class="c-confirm-dialog__message">Message</p>
        <button class="c-confirm-dialog__btn-confirm">Confirm</button>
        <button class="c-confirm-dialog__btn-cancel">Cancel</button>
      </div>
    </div>`;
  
  const dialog = new ConfirmDialog(document.querySelector('.c-confirm-dialog-wrapper'));
  dialog.mount();
  return dialog;
}

describe('ConfirmDialog', () => {
  it('se monta y resuelve sus elementos', () => {
    const dialog = mount();
    expect(dialog.modal).toBeTruthy();
    expect(dialog.confirmBtn).toBeTruthy();
    expect(dialog.cancelBtn).toBeTruthy();
  });

  it('muestra el diálogo, configura textos y resuelve true al confirmar', async () => {
    const dialog = mount();
    const emitSpy = vi.spyOn(dialog, 'emit');

    const promise = new Promise((resolve) => {
      dialog.show({
        title: 'Borrar todo',
        message: '¿Estás seguro?',
        confirmLabel: 'Sí, borrar',
        cancelLabel: 'No, esperar',
        variant: 'danger',
        resolve
      });
    });

    expect(dialog.titleEl.textContent).toBe('Borrar todo');
    expect(dialog.messageEl.textContent).toBe('¿Estás seguro?');
    expect(dialog.confirmBtn.textContent).toBe('Sí, borrar');
    expect(dialog.cancelBtn.textContent).toBe('No, esperar');
    expect(dialog.confirmBtn.classList.contains('c-button--danger')).toBe(true);

    expect(emitSpy).toHaveBeenCalledWith('modal:open', { target: 'confirm-dialog' });

    dialog.confirmBtn.dispatchEvent(new Event('click'));

    const result = await promise;
    expect(result).toBe(true);
    expect(emitSpy).toHaveBeenCalledWith('modal:close', { target: 'confirm-dialog' });
  });

  it('resuelve false al cancelar', async () => {
    const dialog = mount();

    const promise = new Promise((resolve) => {
      dialog.show({ resolve });
    });

    dialog.cancelBtn.dispatchEvent(new Event('click'));

    const result = await promise;
    expect(result).toBe(false);
  });
});
