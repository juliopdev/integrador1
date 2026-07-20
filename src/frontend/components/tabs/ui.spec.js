// @vitest-environment jsdom
/**
 * Pruebas del componente Tabs.
 * Verifica selección de pestañas, emisión de eventos y activación por defecto.
 *
 * @module TabsSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { Tabs } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <nav class="c-tabs" id="my-tabs">
      <button class="c-tabs__tab c-tabs__tab--active" data-target-panel="panel1"></button>
      <button class="c-tabs__tab" data-target-panel="panel2"></button>
    </nav>
    <div id="panel1" data-tab-panel="panel1">Panel 1</div>
    <div id="panel2" data-tab-panel="panel2" hidden style="display: none;">Panel 2</div>
  `;
  return new Tabs(document.querySelector('.c-tabs')).mount();
}

describe('Tabs', () => {
  it('monta y resuelve las pestañas', () => {
    const tabs = mount();
    expect(tabs.tabs.length).toBe(2);
  });

  it('cambia la pestaña activa y conmuta paneles', () => {
    const tabs = mount();
    const emitSpy = vi.spyOn(tabs, 'emit');

    const t1 = tabs.tabs[0];
    const t2 = tabs.tabs[1];
    const p1 = document.getElementById('panel1');
    const p2 = document.getElementById('panel2');

    expect(t1.classList.contains('c-tabs__tab--active')).toBe(true);
    expect(p1.style.display).toBe('');
    expect(p2.style.display).toBe('none');

    t2.dispatchEvent(new Event('click', { bubbles: true }));

    expect(t1.classList.contains('c-tabs__tab--active')).toBe(false);
    expect(t2.classList.contains('c-tabs__tab--active')).toBe(true);
    expect(p1.style.display).toBe('none');
    expect(p2.style.display).toBe('');
    expect(p1.hasAttribute('hidden')).toBe(true);
    expect(p2.hasAttribute('hidden')).toBe(false);

    expect(emitSpy).toHaveBeenCalledWith('tabs:select', { id: 'my-tabs', tabId: 'panel2' });
  });
});
