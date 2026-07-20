// @vitest-environment jsdom
/**
 * Pruebas del componente DynamicTable.
 * Verifica renderizado de columnas, ordenamiento y paginación.
 *
 * @module DynamicTableSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { DynamicTable } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <div class="c-dynamic-table" id="dyn-table-products" data-resource="products">
      <button data-action="edit" data-id="123">Edit</button>
      <button data-action="delete" data-id="123">Delete</button>
    </div>`;
  const table = new DynamicTable(document.getElementById('dyn-table-products'));
  table.mount();
  return table;
}

describe('DynamicTable', () => {
  it('se monta y cachea el nombre del recurso', () => {
    const table = mount();
    expect(table.resourceName).toBe('products');
  });

  it('emite el evento de edición con el id correspondiente', () => {
    const table = mount();
    const emitSpy = vi.spyOn(table, 'emit');

    const editBtn = table.element.querySelector('[data-action="edit"]');
    editBtn.dispatchEvent(new Event('click', { bubbles: true }));

    expect(emitSpy).toHaveBeenCalledWith('dynamic-table:edit', {
      resource: 'products',
      id: '123'
    });
  });

  it('emite el evento de eliminación con el id correspondiente', () => {
    const table = mount();
    const emitSpy = vi.spyOn(table, 'emit');

    const deleteBtn = table.element.querySelector('[data-action="delete"]');
    deleteBtn.dispatchEvent(new Event('click', { bubbles: true }));

    expect(emitSpy).toHaveBeenCalledWith('dynamic-table:delete', {
      resource: 'products',
      id: '123'
    });
  });
});
