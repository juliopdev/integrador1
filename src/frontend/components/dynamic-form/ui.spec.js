// @vitest-environment jsdom
/**
 * Pruebas del componente DynamicForm.
 * Verifica renderizado de fields desde schema, validación y recolección de datos.
 *
 * @module DynamicFormSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { DynamicForm } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <form class="c-dynamic-form" id="my-form" data-resource="products">
      <div class="c-input">
        <input type="text" name="title" required value="">
        <span class="c-input__helper"></span>
      </div>
      <div class="c-input">
        <input type="number" name="price" value="150">
      </div>
      <input type="checkbox" name="active" checked>
      <div class="c-dynamic-form__error" hidden></div>
      <button type="submit">Submit</button>
    </form>`;
  const form = new DynamicForm(document.getElementById('my-form'));
  form.mount();
  return form;
}

describe('DynamicForm', () => {
  it('se monta correctamente', () => {
    const form = mount();
    expect(form.resourceName).toBe('products');
  });

  it('detiene el submit y muestra errores si un campo obligatorio está vacio', () => {
    const form = mount();
    const emitSpy = vi.spyOn(form, 'emit');

    form.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(emitSpy).not.toHaveBeenCalled();
    expect(form.errorEl.hidden).toBe(false);
    expect(form.errorEl.textContent).toContain('completa todos los campos requeridos');
  });

  it('serializa los datos con los tipos correctos y emite al validar correctamente', () => {
    const form = mount();
    const emitSpy = vi.spyOn(form, 'emit');

    const titleInput = form.element.querySelector('input[name="title"]');
    titleInput.value = 'Smartphone';

    form.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(emitSpy).toHaveBeenCalledWith('dynamic-form:submit', {
      resource: 'products',
      data: {
        title: 'Smartphone',
        price: 150,
        active: true
      }
    });
    expect(form.errorEl.hidden).toBe(true);
  });
});
