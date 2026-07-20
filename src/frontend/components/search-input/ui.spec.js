// @vitest-environment jsdom
/**
 * Pruebas del componente SearchInput.
 * Verifica debounce, emisión de eventos de búsqueda y limpieza.
 *
 * @module SearchInputSpec
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchInput } from './ui.js';

function mount(debounceMs = 100) {
  document.body.innerHTML = `
    <div class="c-search-input" data-state="idle">
      <div class="c-search-input__wrapper">
        <input type="search" class="c-search-input__field" name="q" data-debounce="${debounceMs}" />
        <span class="c-search-input__spinner"></span>
        <button type="button" class="c-search-input__clear"></button>
      </div>
    </div>`;
  return new SearchInput(document.querySelector('.c-search-input')).mount();
}

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('monta y resuelve sus selectores', () => {
    const search = mount();
    expect(search.field).toBeTruthy();
    expect(search.clearBtn).toBeTruthy();
  });

  it('realiza una búsqueda con debounce al escribir', () => {
    const search = mount(100);
    const emitSpy = vi.spyOn(search, 'emit');

    search.field.value = 'query';
    search.field.dispatchEvent(new Event('input'));

    expect(emitSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(emitSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(emitSpy).toHaveBeenCalledWith('search:query', { name: 'q', query: 'query' });
  });

  it('muestra y oculta la clase c-search-input--has-value según tenga contenido', () => {
    const search = mount();
    const root = document.querySelector('.c-search-input');
    expect(root.classList.contains('c-search-input--has-value')).toBe(false);

    search.field.value = 'test';
    search.field.dispatchEvent(new Event('input'));
    expect(root.classList.contains('c-search-input--has-value')).toBe(true);

    search.field.value = '';
    search.field.dispatchEvent(new Event('input'));
    expect(root.classList.contains('c-search-input--has-value')).toBe(false);
  });

  it('limpia la búsqueda inmediatamente al hacer click en el botón limpiar', () => {
    const search = mount(100);
    const emitSpy = vi.spyOn(search, 'emit');

    search.field.value = 'testing';
    search.field.dispatchEvent(new Event('input'));
    expect(search.element.classList.contains('c-search-input--has-value')).toBe(true);

    search.clearBtn.dispatchEvent(new Event('click'));
    expect(search.field.value).toBe('');
    expect(search.element.classList.contains('c-search-input--has-value')).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith('search:query', { name: 'q', query: '' });
  });
});
