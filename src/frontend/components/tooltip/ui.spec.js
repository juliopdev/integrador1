// @vitest-environment jsdom
/**
 * Pruebas del componente Tooltip.
 * Verifica montaje, show/hide en hover/focus y posicionamiento.
 *
 * @module TooltipSpec
 */
import { describe, it, expect } from 'vitest';
import { Tooltip } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <div class="c-tooltip" role="tooltip" aria-hidden="true"></div>
    <button id="btn" data-tooltip="Ayuda de prueba">Boton</button>
  `;
  return new Tooltip(document.querySelector('.c-tooltip')).mount();
}

describe('Tooltip', () => {
  it('se monta correctamente', () => {
    const tooltip = mount();
    expect(tooltip).toBeTruthy();
  });

  it('muestra y posiciona el tooltip en mouseover', () => {
    const tooltip = mount();
    const btn = document.getElementById('btn');

    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(tooltip.element.classList.contains('c-tooltip--visible')).toBe(true);
    expect(tooltip.element.textContent).toBe('Ayuda de prueba');
    expect(tooltip.element.style.top).toBeTruthy();
    expect(tooltip.element.style.left).toBeTruthy();
  });

  it('oculta el tooltip en mouseout', () => {
    const tooltip = mount();
    const btn = document.getElementById('btn');

    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tooltip.element.classList.contains('c-tooltip--visible')).toBe(true);

    btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(tooltip.element.classList.contains('c-tooltip--visible')).toBe(false);
  });

  it('no muestra el tooltip si el trigger está dentro de un sidebar expandido', () => {
    document.body.innerHTML = `
      <div class="c-tooltip" role="tooltip" aria-hidden="true"></div>
      <div class="c-sidebar">
        <button id="btn" data-tooltip="Ayuda de prueba">Boton</button>
      </div>
    `;
    const tooltip = new Tooltip(document.querySelector('.c-tooltip')).mount();
    const btn = document.getElementById('btn');

    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tooltip.element.classList.contains('c-tooltip--visible')).toBe(false);
  });
});
