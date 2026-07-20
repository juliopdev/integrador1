// @vitest-environment jsdom
/**
 * Pruebas del componente Terminal.
 * Verifica escritura de líneas, límite de historial y auto-scroll.
 *
 * @module TerminalSpec
 */
import { describe, it, expect } from 'vitest';
import { Terminal } from './ui.js';

function mount(maxLines = 3) {
  document.body.innerHTML = `
    <div class="c-terminal" id="my-term" data-max-lines="${maxLines}">
      <div class="c-terminal__body">
        <div class="c-terminal__output"></div>
      </div>
    </div>`;
  const term = new Terminal(document.getElementById('my-term'));
  term.mount();
  return term;
}

describe('Terminal', () => {
  it('se monta correctamente', () => {
    const term = mount();
    expect(term.bodyEl).toBeTruthy();
    expect(term.outputEl).toBeTruthy();
  });

  it('escribe líneas de consola normales', () => {
    const term = mount();
    term.write('System boot OK');

    const line = term.outputEl.querySelector('.c-terminal__line');
    expect(line).toBeTruthy();
    expect(line.textContent).toBe('System boot OK');
    expect(line.className).toBe('c-terminal__line');
  });

  it('procesa y remueve códigos ANSI aplicando clases CSS coloreadas', () => {
    const term = mount();
    term.write('\x1b[32mSuccess message\x1b[0m');

    const line = term.outputEl.querySelector('.c-terminal__line');
    expect(line).toBeTruthy();
    expect(line.textContent).toBe('Success message');
    expect(line.querySelector('span').classList.contains('c-terminal__ansi--green')).toBe(true);
  });

  it('limita el buffer de líneas', () => {
    const term = mount(2);

    term.write('L1');
    term.write('L2');
    term.write('L3');

    expect(term.outputEl.children.length).toBe(2);
    expect(term.outputEl.firstChild.textContent).toBe('L2');
    expect(term.outputEl.lastChild.textContent).toBe('L3');
  });
});
