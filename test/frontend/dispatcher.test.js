// @vitest-environment jsdom
/**
 * Pruebas unitarias del dispatcher frontend (data-action → bus).
 * Verifica que los clics en elementos con atributo `data-action` emiten
 * eventos al bus y que los botones deshabilitados son ignorados.
 *
 * @module DispatcherTest
 */
import { describe, it, expect, vi } from 'vitest';
import { bus } from '../../src/frontend/scripts/lib/bus.js';
import { initDispatcher } from '../../src/frontend/scripts/lib/dispatcher.js';

describe('dispatcher (data-action → bus)', () => {
  it('un click en [data-action] emite la acción al bus con su target', () => {
    document.body.innerHTML = '<button data-action="modal:open" data-target="create-tenant">Abrir</button>';
    initDispatcher(document);

    const spy = vi.fn();
    bus.on('modal:open', spy);
    document.querySelector('button').click();

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ target: 'create-tenant' }));
  });

  it('ignora botones deshabilitados', () => {
    document.body.innerHTML = '<button data-action="x:go" disabled>No</button>';
    initDispatcher(document);
    const spy = vi.fn();
    bus.on('x:go', spy);
    document.querySelector('button').click();
    expect(spy).not.toHaveBeenCalled();
  });
});
