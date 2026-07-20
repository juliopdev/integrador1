// @vitest-environment jsdom
/**
 * Pruebas del componente Input.
 * Verifica montaje, estados (error, disabled) y actualización de valor.
 *
 * @module InputSpec
 */
import { describe, it, expect } from 'vitest';
import { Input } from './ui.js';

function mount(error) {
  document.body.innerHTML = `
    <div class="c-input" data-invalid="${error ? 'true' : 'false'}">
      <input class="c-input__field" />
      <span class="c-input__error">${error || ''}</span>
    </div>`;
  return new Input(document.querySelector('.c-input')).mount();
}

describe('Input', () => {
  it('monta y resuelve sus selectores', () => {
    const input = mount();
    expect(input.field).toBeTruthy();
    expect(input.errorEl).toBeTruthy();
  });

  it('limpia el error al escribir (muta data-invalid + vacía el mensaje)', () => {
    mount('Campo requerido');
    const root = document.querySelector('.c-input');
    expect(root.dataset.invalid).toBe('true');

    document.querySelector('.c-input__field').dispatchEvent(new Event('input'));

    expect(root.dataset.invalid).toBe('false');
    expect(document.querySelector('.c-input__error').textContent).toBe('');
  });

  it('onDestroy desvincula el listener', () => {
    const input = mount('x');
    input.destroy();
    document.querySelector('.c-input__field').dispatchEvent(new Event('input'));
    expect(document.querySelector('.c-input').dataset.invalid).toBe('true'); // ya no reacciona
  });
});
