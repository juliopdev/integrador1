// @vitest-environment jsdom
/**
 * Pruebas del componente Sidebar.
 * Verifica colapso/expansión, persistencia en localStorage y lectura de estado.
 *
 * @module SidebarSpec
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sidebar, readSidebarCollapsed } from './ui.js';

function mountSidebar() {
  document.body.innerHTML = `
    <div class="l-dashboard-grid">
      <aside class="c-sidebar" data-component="sidebar">
        <div class="c-sidebar__brand">
          <span class="c-sidebar__logo-text">Mi Baas</span>
          <button type="button" data-action="sidebar:toggle" aria-label="Colapsar/expandir menú" aria-expanded="true">☰</button>
        </div>
      </aside>
    </div>`;
  return new Sidebar(document.querySelector('.c-sidebar')).mount();
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { window.localStorage.clear(); });

describe('Sidebar (Iter 34)', () => {
  it('click en el toggle agrega `c-sidebar--collapsed` + `l-dashboard-grid--collapsed`', () => {
    mountSidebar();
    const aside = document.querySelector('.c-sidebar');
    const grid = document.querySelector('.l-dashboard-grid');
    const btn = document.querySelector('[data-action="sidebar:toggle"]');
    expect(aside.classList.contains('c-sidebar--collapsed')).toBe(false);
    btn.click();
    expect(aside.classList.contains('c-sidebar--collapsed')).toBe(true);
    expect(grid.classList.contains('l-dashboard-grid--collapsed')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('un segundo click revierte al estado expandido', () => {
    mountSidebar();
    const aside = document.querySelector('.c-sidebar');
    const btn = document.querySelector('[data-action="sidebar:toggle"]');
    btn.click();
    btn.click();
    expect(aside.classList.contains('c-sidebar--collapsed')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('persiste la preferencia en localStorage (`ui.sidebar.collapsed`)', () => {
    mountSidebar();
    const btn = document.querySelector('[data-action="sidebar:toggle"]');
    btn.click();
    expect(window.localStorage.getItem('ui.sidebar.collapsed')).toBe('1');
    btn.click();
    expect(window.localStorage.getItem('ui.sidebar.collapsed')).toBe('0');
  });

  it('`readSidebarCollapsed()` refleja lo guardado', () => {
    expect(readSidebarCollapsed()).toBe(false);
    window.localStorage.setItem('ui.sidebar.collapsed', '1');
    expect(readSidebarCollapsed()).toBe(true);
  });
});
