// @vitest-environment jsdom
/**
 * Pruebas del componente Textarea.
 * Verifica montaje, contador de caracteres, límite máximo y estado de error.
 *
 * @module TextareaSpec
 */
import { describe, it, expect } from 'vitest';
import { Textarea } from './ui.js';

function mount(error, maxLength = 10) {
  document.body.innerHTML = `
    <div class="c-input c-textarea" data-invalid="${error ? 'true' : 'false'}">
      <textarea class="c-input__field c-input__field--textarea"></textarea>
      <span class="c-input__counter" data-max="${maxLength}">0 / ${maxLength}</span>
      <span class="c-input__error">${error || ''}</span>
    </div>`;
  return new Textarea(document.querySelector('.c-textarea')).mount();
}

describe('Textarea', () => {
  it('monta y resuelve sus selectores', () => {
    const textarea = mount();
    expect(textarea.field).toBeTruthy();
    expect(textarea.errorEl).toBeTruthy();
    expect(textarea.counterEl).toBeTruthy();
  });

  it('limpia el error al escribir', () => {
    mount('Requerido');
    const root = document.querySelector('.c-textarea');
    expect(root.dataset.invalid).toBe('true');

    document.querySelector('.c-input__field--textarea').dispatchEvent(new Event('input'));

    expect(root.dataset.invalid).toBe('false');
    expect(document.querySelector('.c-input__error').textContent).toBe('');
  });

  it('actualiza el contador de caracteres reactivamente y cambia estados de dataset', () => {
    const textarea = mount(null, 10);
    const counter = document.querySelector('.c-input__counter');
    const field = document.querySelector('.c-input__field--textarea');

    expect(counter.textContent).toBe('0 / 10');

    // Escribir 5 caracteres
    field.value = 'hello';
    field.dispatchEvent(new Event('input'));
    expect(counter.textContent).toBe('5 / 10');
    expect(counter.dataset.warning).toBe('false');
    expect(counter.dataset.error).toBe('false');

    // Escribir 9 caracteres (90% >= 85% warning)
    field.value = 'hello 123';
    field.dispatchEvent(new Event('input'));
    expect(counter.textContent).toBe('9 / 10');
    expect(counter.dataset.warning).toBe('true');
    expect(counter.dataset.error).toBe('false');

    // Escribir 10 caracteres (100% >= 100% error)
    field.value = 'hello 1234';
    field.dispatchEvent(new Event('input'));
    expect(counter.textContent).toBe('10 / 10');
    expect(counter.dataset.warning).toBe('false');
    expect(counter.dataset.error).toBe('true');
  });

  it('onDestroy desvincula el listener', () => {
    const textarea = mount('error');
    textarea.destroy();
    document.querySelector('.c-input__field--textarea').dispatchEvent(new Event('input'));
    expect(document.querySelector('.c-textarea').dataset.invalid).toBe('true');
  });
});
