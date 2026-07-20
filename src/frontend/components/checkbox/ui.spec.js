/**
 * Pruebas del componente Checkbox (EJS + SCSS).
 * Verifica renderizado de markup, estados (checked, disabled) y emisión de estilos.
 *
 * @module CheckboxSpec
 */
import { describe, it, expect } from 'vitest';
import ejs from 'ejs';
import * as sass from 'sass';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Componente SSR sin `ui.js` — el test valida render EJS + SCSS compilado (no clase JS).
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(here, '../..'); // src/frontend/

describe('checkbox', () => {
  it('render: name/value/checked + label escapado', async () => {
    const html = await ejs.renderFile(join(here, 'ui.ejs'), {
      name: 'required',
      label: '<b>Requerido</b>',
      checked: true,
    });
    expect(html).toContain('name="required"');
    expect(html).toContain('value="true"');
    expect(html).toContain('checked');
    expect(html).not.toContain('<b>Requerido</b>'); // XSS: escapa el label
    expect(html).toContain('&lt;b&gt;');
  });

  it('render: variante switch + disabled', async () => {
    const html = await ejs.renderFile(join(here, 'ui.ejs'), {
      name: 'wsEnabled',
      variant: 'switch',
      disabled: true,
      ariaLabel: 'Canal habilitado',
    });
    expect(html).toContain('c-checkbox--switch');
    expect(html).toContain('c-checkbox--disabled');
    expect(html).toContain('disabled');
    expect(html).toContain('aria-label="Canal habilitado"');
  });

  it('render: sin hidden gemelo (regresión P0.2 — la key ausente significa false)', async () => {
    const html = await ejs.renderFile(join(here, 'ui.ejs'), { name: 'required' });
    expect(html).not.toContain('type="hidden"');
  });

  it('scss: theme.subscribe emite .c-checkbox con tokens (no literales)', () => {
    const { css } = sass.compile(join(FRONTEND, 'styles/dashboard.scss'));
    expect(css).toContain('.c-checkbox');
    expect(css).toContain('var(--color-primary-600)');
    expect(css).toContain('var(--color-on-primary)');
  });
});
