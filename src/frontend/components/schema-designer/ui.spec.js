// @vitest-environment jsdom
/**
 * Pruebas del componente SchemaDesigner.
 * Verifica adición/edición/eliminación de campos y exportación del schema.
 *
 * @module SchemaDesignerSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { SchemaDesigner } from './ui.js';

function mount(initial = []) {
  document.body.innerHTML = `
    <div class="c-schema-designer" id="designer" data-initial='${JSON.stringify(initial)}'>
      <div class="js-designer-name">
        <input type="text" name="new_field_name" value="">
      </div>
      <select class="js-designer-type">
        <option value="string">String</option>
        <option value="integer">Integer</option>
      </select>
      <div class="js-designer-required">
        <input type="checkbox" name="new_field_required">
      </div>
      <button type="button" class="js-designer-add">Add</button>
      <div class="js-designer-list"></div>
      <input type="hidden" name="schema_json" class="js-designer-input" value="">
    </div>`;
  const designer = new SchemaDesigner(document.getElementById('designer'));
  designer.mount();
  return designer;
}

describe('SchemaDesigner', () => {
  it('se monta y pinta la lista inicial de campos', () => {
    const designer = mount([{ id: 'f1', name: 'title', type: 'string', required: true }]);
    expect(designer.fields.length).toBe(1);
    expect(designer.listEl.querySelector('.c-schema-designer__item-name').textContent).toBe('title');
  });

  it('añade un nuevo campo al listado y actualiza el JSON oculto', () => {
    const designer = mount();
    const emitSpy = vi.spyOn(designer, 'emit');

    const nameInput = designer.element.querySelector('.js-designer-name input');
    const typeSelect = designer.element.querySelector('.js-designer-type');
    const reqInput = designer.element.querySelector('.js-designer-required input');

    nameInput.value = 'price';
    typeSelect.value = 'integer';
    reqInput.checked = true;

    designer.addBtn.dispatchEvent(new Event('click'));

    expect(designer.fields.length).toBe(1);
    expect(designer.fields[0].name).toBe('price');
    expect(designer.fields[0].type).toBe('integer');
    expect(designer.fields[0].required).toBe(true);

    expect(designer.inputEl.value).toContain('price');
    expect(emitSpy).toHaveBeenCalledWith('schema:change', expect.any(Object));
  });

  it('elimina un campo al pulsar el botón de eliminar', () => {
    const designer = mount([{ id: 'f-1', name: 'title', type: 'string', required: false }]);
    expect(designer.fields.length).toBe(1);

    const delBtn = designer.listEl.querySelector('[data-delete-id]');
    delBtn.dispatchEvent(new Event('click', { bubbles: true }));

    expect(designer.fields.length).toBe(0);
    expect(designer.inputEl.value).toBe('[]');
  });
});
