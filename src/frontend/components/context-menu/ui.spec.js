// @vitest-environment jsdom
/**
 * Pruebas del componente ContextMenu.
 * Verifica apertura en clic derecho, posicionamiento y cierre.
 *
 * @module ContextMenuSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { ContextMenu } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <div id="trigger" data-context-menu="my-context">Right-click me</div>
    <div class="c-context-menu" id="my-context">
      <button class="c-context-menu__item" data-action="context:action1">Action 1</button>
    </div>`;
  const menu = new ContextMenu(document.getElementById('my-context'));
  menu.mount();
  return menu;
}

describe('ContextMenu', () => {
  it('se monta correctamente', () => {
    const menu = mount();
    expect(menu).toBeTruthy();
  });

  it('abre y posiciona el menú en contextmenu del trigger', () => {
    const menu = mount();
    const trigger = document.getElementById('trigger');
    const root = document.getElementById('my-context');

    expect(root.dataset.open).toBe('false');

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 150
    });
    
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    trigger.dispatchEvent(event);

    expect(root.dataset.open).toBe('true');
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(root.style.top).toBe('150px');
    expect(root.style.left).toBe('100px');
  });

  it('cierra el menú ante clicks fuera', () => {
    const menu = mount();
    const trigger = document.getElementById('trigger');
    const root = document.getElementById('my-context');

    const event = new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 });
    trigger.dispatchEvent(event);
    expect(root.dataset.open).toBe('true');

    document.dispatchEvent(new Event('click', { bubbles: true }));
    expect(root.dataset.open).toBe('false');
  });

  it('despacha la acción en el bus al hacer click en un item', () => {
    const menu = mount();
    const trigger = document.getElementById('trigger');
    const root = document.getElementById('my-context');
    const emitSpy = vi.spyOn(menu, 'emit');

    const event = new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 });
    trigger.dispatchEvent(event);

    const item = root.querySelector('.c-context-menu__item');
    item.dispatchEvent(new Event('click', { bubbles: true }));

    expect(emitSpy).toHaveBeenCalledWith('context:action1', {
      contextMenuId: 'my-context',
      trigger
    });
    expect(root.dataset.open).toBe('false');
  });
});
