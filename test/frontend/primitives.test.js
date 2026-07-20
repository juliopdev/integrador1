/**
 * Pruebas de renderizado de primitivos markup (EJS) y emisión de estilos (SCSS).
 * Verifica que los componentes base (card, badge, alert, spinner, empty-state)
 * se renderizan correctamente y que dashboard.scss emite todas las clases
 * esperadas con tokens del sistema de diseño.
 *
 * @module PrimitivesTest
 */
import { describe, it, expect } from 'vitest';
import ejs from 'ejs';
import * as sass from 'sass';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../src/frontend');

/**
 * Renderiza un template EJS de componente.
 * @param {string} name - Nombre del componente (subdirectorio en components/).
 * @param {Object} data - Locals pasados al template.
 * @returns {Promise<string>} HTML renderizado.
 * @example
 * const html = await render('card', { title: 'Test', body: '<p>content</p>', padding: 'lg' });
 */
const render = (name, data) => ejs.renderFile(join(ROOT, `components/${name}/ui.ejs`), data);

describe('primitivos markup (render EJS)', () => {
  it('card: título + body (HTML de confianza) + padding', async () => {
    const html = await render('card', { title: 'Tenants', body: '<p>contenido</p>', padding: 'lg' });
    expect(html).toContain('c-card--p-lg');
    expect(html).toContain('Tenants');
    expect(html).toContain('<p>contenido</p>'); // body sin escapar
  });

  it('badge: variante de estado + label escapado', async () => {
    const html = await render('badge', { variant: 'success', label: 'active' });
    expect(html).toContain('c-badge--success');
    expect(html).toContain('active');
  });

  it('alert: variante + mensaje + role=alert', async () => {
    const html = await render('alert', { variant: 'error', message: 'Algo falló', title: 'Error' });
    expect(html).toContain('c-alert--error');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Algo falló');
  });

  it('spinner: tamaño + aria-label', async () => {
    const html = await render('spinner', { size: 'lg', label: 'Cargando datos' });
    expect(html).toContain('c-spinner--lg');
    expect(html).toContain('aria-label="Cargando datos"');
  });

  it('empty-state: compone un button como CTA (include)', async () => {
    const html = await render('empty-state', { title: 'Sin backends', cta: { label: 'Crear', action: 'modal:open', target: 'create' } });
    expect(html).toContain('c-empty-state__title');
    expect(html).toContain('Sin backends');
    expect(html).toContain('c-button'); // el CTA incluye el componente button
    expect(html).toContain('data-action="modal:open"');
  });
});

describe('primitivos markup (emisión SCSS)', () => {
  it('dashboard.scss emite todos los primitivos con tokens', () => {
    const { css } = sass.compile(join(ROOT, 'styles/dashboard.scss'));
    for (const cls of ['.c-card', '.c-badge', '.c-alert', '.c-spinner', '.c-empty-state']) {
      expect(css).toContain(cls);
    }
    expect(css).toContain('animation: spin'); // spinner usa el keyframe compartido
  });
});
