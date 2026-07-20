// @vitest-environment jsdom
/**
 * Pruebas del componente ThemeSettings.
 * Verifica lectura/escritura de skin y modo, aplicación de tema dinámico
 * y bootstrap desde localStorage.
 *
 * @module ThemeSettingsSpec
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeSettings, readSkin, readMode, applyTheme, bootstrapTheme } from './ui.js';
import { bus } from '../../scripts/lib/bus.js';

function mountForm() {
  document.body.innerHTML = `
    <form data-component="theme-settings">
      <select name="skin">
        <option value="default">Default</option>
        <option value="minimalist">Minimalist</option>
        <option value="glassmorphism">Glassmorphism</option>
      </select>
      <select name="mode">
        <option value="system">Auto</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <button type="submit">Aplicar</button>
    </form>`;
  return new ThemeSettings(document.querySelector('[data-component="theme-settings"]')).mount();
}

beforeEach(() => {
  window.localStorage.clear();
  bus.all.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-mode');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('ThemeSettings (Iter 35)', () => {
  it('lee los valores actuales de localStorage al montar', () => {
    window.localStorage.setItem('ui.theme.skin', 'minimalist');
    window.localStorage.setItem('ui.theme.mode', 'dark');
    mountForm();
    expect(document.querySelector('[name="skin"]').value).toBe('minimalist');
    expect(document.querySelector('[name="mode"]').value).toBe('dark');
  });

  it('al submit aplica `data-theme` + `data-theme-mode` en el <html>', () => {
    mountForm();
    document.querySelector('[name="skin"]').value = 'glassmorphism';
    document.querySelector('[name="mode"]').value = 'dark';
    document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(document.documentElement.dataset.theme).toBe('glassmorphism');
    expect(document.documentElement.dataset.themeMode).toBe('dark');
  });

  it('persiste skin + mode en localStorage', () => {
    mountForm();
    document.querySelector('[name="skin"]').value = 'minimalist';
    document.querySelector('[name="mode"]').value = 'light';
    document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(window.localStorage.getItem('ui.theme.skin')).toBe('minimalist');
    expect(window.localStorage.getItem('ui.theme.mode')).toBe('light');
  });

  it('emite `modal:close` para el modal de settings + toast de éxito', () => {
    const onClose = vi.fn();
    const onToast = vi.fn();
    bus.on('modal:close', onClose);
    bus.on('toast', onToast);
    mountForm();
    document.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ target: 'settings-modal' }));
    expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
  });

  it('`readSkin/readMode` degradan a defaults cuando no hay nada guardado', () => {
    expect(readSkin()).toBe('default');
    expect(readMode()).toBe('system');
  });

  it('`applyTheme` muta el <html> sin tocar localStorage', () => {
    applyTheme('minimalist', 'dark');
    expect(document.documentElement.dataset.theme).toBe('minimalist');
    expect(document.documentElement.dataset.themeMode).toBe('dark');
    expect(window.localStorage.getItem('ui.theme.skin')).toBeNull();
  });

  it('`bootstrapTheme` sin query aplica lo guardado', () => {
    window.localStorage.setItem('ui.theme.skin', 'minimalist');
    window.localStorage.setItem('ui.theme.mode', 'dark');
    bootstrapTheme('');
    expect(document.documentElement.dataset.theme).toBe('minimalist');
    expect(document.documentElement.dataset.themeMode).toBe('dark');
  });

  it('`bootstrapTheme` con ?skin/?mode válidos gana a localStorage y persiste', () => {
    window.localStorage.setItem('ui.theme.skin', 'default');
    bootstrapTheme('?skin=glassmorphism&mode=dark');
    expect(document.documentElement.dataset.theme).toBe('glassmorphism');
    expect(document.documentElement.dataset.themeMode).toBe('dark');
    expect(window.localStorage.getItem('ui.theme.skin')).toBe('glassmorphism');
    expect(window.localStorage.getItem('ui.theme.mode')).toBe('dark');
  });

  it('`bootstrapTheme` ignora valores inválidos en la query', () => {
    window.localStorage.setItem('ui.theme.skin', 'minimalist');
    bootstrapTheme('?skin=hacker&mode=neon');
    expect(document.documentElement.dataset.theme).toBe('minimalist');
    expect(document.documentElement.dataset.themeMode).toBe('system');
    expect(window.localStorage.getItem('ui.theme.skin')).toBe('minimalist');
  });
});
