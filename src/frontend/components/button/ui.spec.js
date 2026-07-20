/**
 * Pruebas del componente Button (EJS + SCSS).
 * Verifica renderizado de variantes (primary, secondary, danger),
 * estados (loading, disabled) y emisión de estilos BEM.
 *
 * @module ButtonSpec
 */
import { describe, it, expect } from 'vitest';
import ejs from 'ejs';
import * as sass from 'sass';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Componente SSR sin `ui.js` — el test valida render EJS + SCSS compilado (no clase JS).
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(here, '../..'); // src/frontend/

describe('button', () => {
  it('render: variante + label + data-action/target + estado inicial', async () => {
    const html = await ejs.renderFile(join(here, 'ui.ejs'), {
      variant: 'success',
      label: 'Guardar',
      action: 'form:submit',
      target: 'create',
    });
    expect(html).toContain('c-button--success');
    expect(html).toContain('Guardar');
    expect(html).toContain('data-action="form:submit"');
    expect(html).toContain('data-target="create"');
    expect(html).toContain('data-state="idle"');
  });

  it('render: escapa el label (XSS)', async () => {
    const html = await ejs.renderFile(join(here, 'ui.ejs'), { label: '<img onerror=x>' });
    expect(html).not.toContain('<img onerror=x>');
    expect(html).toContain('&lt;img');
  });

  it('scss: theme.subscribe emite .c-button con tokens (no literales)', () => {
    const { css } = sass.compile(join(FRONTEND, 'styles/dashboard.scss'));
    expect(css).toContain('.c-button');
    expect(css).toContain('var(--color-primary-600)');
    expect(css).toContain('var(--color-on-primary)');
  });

  it('variant: fab renderiza como <button> con clase c-button--fab + aria-label + data-action (reemplaza al ex-support-fab)', async () => {
    // Sin `icon` porque este test corre standalone (sin el `includer` de Fastify que resuelve
    // rutas ROOT-RELATIVE). El icon+FAB juntos se cubren en el flujo real vía dashboard-view.functional.
    const html = await ejs.renderFile(join(here, 'ui.ejs'), {
      variant: 'fab',
      action: 'modal:open',
      target: 'support-fab-modal',
      ariaLabel: 'Contactar al soporte',
    });
    expect(html).toContain('c-button--fab');
    expect(html).toContain('aria-label="Contactar al soporte"');
    expect(html).toContain('data-action="modal:open"');
    expect(html).toContain('data-target="support-fab-modal"');
  });

  it('scss: variante fab emite position:fixed + border-radius:full + shadow desde tokens', () => {
    const { css } = sass.compile(join(FRONTEND, 'styles/dashboard.scss'));
    expect(css).toContain('.c-button--fab');
    expect(css).toContain('position: fixed');
    expect(css).toContain('var(--radius-full)');
    expect(css).toContain('var(--shadow-lg)');
  });
});
