// @vitest-environment jsdom
/**
 * Pruebas del componente CopyButton.
 * Verifica copia al portapapeles y feedback visual de éxito/error.
 *
 * @module CopyButtonSpec
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopyButton } from './ui.js';

function mount(text = 'test copy') {
  document.body.innerHTML = `
    <button class="c-copy-button" data-copy="${text}" data-state="idle">
      <span class="c-copy-button__icon-copy"></span>
      <span class="c-copy-button__icon-check"></span>
    </button>`;
  const btn = new CopyButton(document.querySelector('.c-copy-button'));
  btn.mount();
  return btn;
}

describe('CopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (typeof navigator === 'undefined') {
      global.navigator = {};
    }
    navigator.clipboard = {
      writeText: vi.fn().mockResolvedValue(true)
    };
  });

  it('se monta correctamente', () => {
    const btn = mount();
    expect(btn).toBeTruthy();
  });

  it('copia el texto al portapapeles y cambia al estado copied', async () => {
    const btn = mount('hello word');
    const emitSpy = vi.spyOn(btn, 'emit');

    btn.element.dispatchEvent(new Event('click'));

    await vi.runAllTicks();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello word');
    expect(btn.element.dataset.state).toBe('copied');
    expect(emitSpy).toHaveBeenCalledWith('toast', {
      variant: 'success',
      message: 'Copiado al portapapeles'
    });

    vi.advanceTimersByTime(2000);
    expect(btn.element.dataset.state).toBe('idle');
  });
});
