// @vitest-environment jsdom
/**
 * Pruebas del componente ToastStack.
 * Verifica suscripción al bus, renderizado de notificaciones y auto-dismiss.
 *
 * @module ToastSpec
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToastStack } from './ui.js';
import { bus } from '../../scripts/lib/bus.js';

beforeEach(() => {
  vi.useFakeTimers();
  bus.all.clear();
  document.body.innerHTML = '<div class="c-toast-stack" id="toast-stack"></div>';
  new ToastStack(document.querySelector('#toast-stack')).mount();
});
afterEach(() => vi.useRealTimers());

describe('ToastStack', () => {
  it('crea un toast al emitir el evento `toast` en el bus', () => {
    bus.emit('toast', { variant: 'success', message: 'Guardado' });
    const toast = document.querySelector('.c-toast');
    expect(toast).toBeTruthy();
    expect(toast.classList.contains('c-toast--success')).toBe(true);
    expect(toast.textContent).toBe('Guardado');
  });

  it('se auto-cierra tras la duración', () => {
    bus.emit('toast', { message: 'efímero', duration: 1000 });
    expect(document.querySelectorAll('.c-toast')).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(document.querySelectorAll('.c-toast')).toHaveLength(0);
  });
});
