// @vitest-environment jsdom
/**
 * Pruebas del componente DropdownMenu.
 * Verifica apertura/cierre, selección de ítems y cierre al hacer clic fuera.
 *
 * @module DropdownMenuSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { DropdownMenu } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <button id="trigger" data-target="my-dropdown">Trigger</button>
    <div class="c-dropdown-menu" id="my-dropdown">
      <button class="c-dropdown-menu__item" data-action="dropdown:action1">Action 1</button>
    </div>`;
  const menu = new DropdownMenu(document.getElementById('my-dropdown'));
  menu.mount();
  return menu;
}

describe('DropdownMenu', () => {
  it('se monta correctamente', () => {
    const menu = mount();
    expect(menu).toBeTruthy();
  });

  it('abre y posiciona el menú al hacer click en el trigger', () => {
    const menu = mount();
    const trigger = document.getElementById('trigger');
    const root = document.getElementById('my-dropdown');

    expect(root.dataset.open).toBe('false');

    trigger.dispatchEvent(new Event('click', { bubbles: true }));

    expect(root.dataset.open).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.dispatchEvent(new Event('click', { bubbles: true }));
    expect(root.dataset.open).toBe('false');
  });

  it('cierra el menú ante clicks fuera', () => {
    const menu = mount();
    const trigger = document.getElementById('trigger');
    const root = document.getElementById('my-dropdown');

    trigger.dispatchEvent(new Event('click', { bubbles: true }));
    expect(root.dataset.open).toBe('true');

    document.dispatchEvent(new Event('click', { bubbles: true }));
    expect(root.dataset.open).toBe('false');
  });

  it('despacha la acción en el bus al hacer click en un item', () => {
    const menu = mount();
    const trigger = document.getElementById('trigger');
    const root = document.getElementById('my-dropdown');
    const emitSpy = vi.spyOn(menu, 'emit');

    trigger.dispatchEvent(new Event('click', { bubbles: true }));

    const item = root.querySelector('.c-dropdown-menu__item');
    item.dispatchEvent(new Event('click', { bubbles: true }));

    // Iter 52: el payload incluye `target` desde el `data-target` del item (null si no está).
    expect(emitSpy).toHaveBeenCalledWith('dropdown:action1', {
      dropdownId: 'my-dropdown',
      trigger,
      target: null,
    });
    expect(root.dataset.open).toBe('false');
  });

  it('propaga `data-target` del item al payload (Iter 52 — permite disparar modal:open con target)', () => {
    document.body.innerHTML = `
      <button id="trigger" data-target="my-dropdown">Trigger</button>
      <div class="c-dropdown-menu" id="my-dropdown">
        <button class="c-dropdown-menu__item" data-action="modal:open" data-target="settings-modal">Configuración</button>
      </div>`;
    const menu = new DropdownMenu(document.getElementById('my-dropdown'));
    menu.mount();
    const trigger = document.getElementById('trigger');
    const emitSpy = vi.spyOn(menu, 'emit');

    trigger.dispatchEvent(new Event('click', { bubbles: true }));
    document.querySelector('.c-dropdown-menu__item').dispatchEvent(new Event('click', { bubbles: true }));

    expect(emitSpy).toHaveBeenCalledWith('modal:open', {
      dropdownId: 'my-dropdown',
      trigger,
      target: 'settings-modal',
    });
  });
});
