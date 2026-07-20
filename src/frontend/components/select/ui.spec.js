// @vitest-environment jsdom
/**
 * Pruebas del componente Select.
 * Verifica renderizado de opciones, selección, búsqueda y teclado.
 *
 * @module SelectSpec
 */
import { describe, it, expect } from 'vitest';
import { Select } from './ui.js';

function mount(searchable = false) {
  document.body.innerHTML = `
    <div class="c-input c-select" data-open="false">
      <select class="c-select__native" name="role">
        <option value="">Select role</option>
        <option value="admin">Admin</option>
        <option value="user" selected>User</option>
      </select>
      <button type="button" class="c-select__trigger">
        <span class="c-select__trigger-label">User</span>
        <span class="c-select__trigger-arrow"></span>
      </button>
      <div class="c-select__dropdown">
        ${searchable ? `
        <div class="c-select__search-wrapper">
          <input type="text" class="c-select__search" />
        </div>` : ''}
        <ul class="c-select__options">
          <li class="c-select__option" data-value="">Select role</li>
          <li class="c-select__option" data-value="admin">Admin</li>
          <li class="c-select__option c-select__option--selected" data-value="user">User</li>
        </ul>
      </div>
      <span class="c-input__error"></span>
    </div>`;
  return new Select(document.querySelector('.c-select')).mount();
}

describe('Select', () => {
  it('monta y resuelve sus selectores', () => {
    const select = mount();
    expect(select.nativeSelect).toBeTruthy();
    expect(select.trigger).toBeTruthy();
    expect(select.dropdown).toBeTruthy();
    expect(select.options.length).toBe(3);
  });

  it('abre y cierra el dropdown al hacer click en el trigger', () => {
    const select = mount();
    const root = document.querySelector('.c-select');
    expect(root.dataset.open).toBe('false');

    select.trigger.dispatchEvent(new Event('click'));
    expect(root.dataset.open).toBe('true');

    select.trigger.dispatchEvent(new Event('click'));
    expect(root.dataset.open).toBe('false');
  });

  it('cierra el dropdown al hacer click afuera', () => {
    const select = mount();
    const root = document.querySelector('.c-select');
    
    select.trigger.dispatchEvent(new Event('click'));
    expect(root.dataset.open).toBe('true');

    document.dispatchEvent(new Event('click'));
    expect(root.dataset.open).toBe('false');
  });

  it('selecciona una opción, actualiza el select nativo y emite evento change', () => {
    const select = mount();
    const root = document.querySelector('.c-select');
    
    let changeFired = false;
    select.nativeSelect.addEventListener('change', () => {
      changeFired = true;
    });

    const adminOption = select.options.find(o => o.dataset.value === 'admin');
    
    select.trigger.dispatchEvent(new Event('click'));
    adminOption.dispatchEvent(new Event('click', { bubbles: true }));

    expect(select.nativeSelect.value).toBe('admin');
    expect(select.triggerLabel.textContent).toBe('Admin');
    expect(root.dataset.open).toBe('false');
    expect(changeFired).toBe(true);
  });

  it('filtra opciones en el buscador si es searchable', () => {
    const select = mount(true);
    
    select.trigger.dispatchEvent(new Event('click'));
    select.searchField.value = 'ad';
    select.searchField.dispatchEvent(new Event('input'));

    const hiddenOpts = select.options.filter(o => o.classList.contains('c-select__option--hidden'));
    const visibleOpts = select.options.filter(o => !o.classList.contains('c-select__option--hidden'));

    expect(visibleOpts.length).toBe(1);
    expect(visibleOpts[0].dataset.value).toBe('admin');
    expect(hiddenOpts.length).toBe(2);
  });
});
