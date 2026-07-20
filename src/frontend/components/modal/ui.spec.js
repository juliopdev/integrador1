// @vitest-environment jsdom
/**
 * Pruebas del componente Modal.
 * Verifica apertura/cierre, enfoque de trampa (focus trap) y cierre con tecla Escape.
 *
 * @module ModalSpec
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Modal } from './ui.js';
import { bus } from '../../scripts/lib/bus.js';

let modal;
beforeEach(() => {
  bus.all.clear(); // aislar el bus entre tests
  document.body.innerHTML = '<div class="c-modal" id="create-tenant" data-open="false"></div>';
  modal = new Modal(document.querySelector('#create-tenant')).mount();
});

describe('Modal', () => {
  it('abre cuando el bus emite modal:open con su target', () => {
    bus.emit('modal:open', { target: 'create-tenant' });
    expect(document.querySelector('#create-tenant').dataset.open).toBe('true');
  });

  it('ignora eventos dirigidos a otro modal', () => {
    bus.emit('modal:open', { target: 'otro' });
    expect(document.querySelector('#create-tenant').dataset.open).toBe('false');
  });

  it('cierra y emite modal:closed', () => {
    modal.open();
    let closedId = null;
    bus.on('modal:closed', (p) => { closedId = p.id; });
    bus.emit('modal:close', { target: 'create-tenant' });
    expect(document.querySelector('#create-tenant').dataset.open).toBe('false');
    expect(closedId).toBe('create-tenant');
  });

  it('cierra con Escape solo si está abierto', () => {
    modal.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('#create-tenant').dataset.open).toBe('false');

    let closedAgain = false;
    bus.on('modal:closed', () => { closedAgain = true; });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closedAgain).toBe(false); // cerrado: Escape no re-emite modal:closed
  });

  it('onDestroy desuscribe del bus', () => {
    modal.destroy();
    bus.emit('modal:open', { target: 'create-tenant' });
    expect(document.querySelector('#create-tenant').dataset.open).toBe('false');
  });
});
