/**
 * Pruebas del sistema de temas SCSS multi-skin.
 * Verifica que los entry points (dashboard.scss, auth.scss) compilan sin
 * errores, emiten tokens semánticos correctos y que el sanitizer de temas
 * descarta tokens fuera de la allowlist con @warn.
 *
 * @module ThemeSystemTest
 */
import { describe, it, expect } from 'vitest';
import * as sass from 'sass';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const STYLES = join(here, '../../src/frontend/styles');

/**
 * Compila un archivo SCSS y captura sus warnings.
 * @param {string} name - Nombre del archivo (ej. 'dashboard.scss').
 * @returns {{ css: string, warnings: string[] }} CSS compilado y lista de warnings.
 * @example
 * const { css, warnings } = compileFile('dashboard.scss');
 */
function compileFile(name) {
  const warnings = [];
  const { css } = sass.compile(join(STYLES, name), {
    logger: { warn: (m) => warnings.push(m), debug: () => {} },
  });
  return { css, warnings };
}

describe('sistema de temas (SCSS)', () => {
  it('dashboard.scss compila sin warnings y emite los tokens del skin default', () => {
    const { css, warnings } = compileFile('dashboard.scss');
    expect(warnings).toEqual([]); // el default no inventa tokens → sin @warn del sanitizer
    expect(css).toMatch(/\[data-theme=["']?default["']?\]/);
    expect(css).toMatch(/\[data-theme-mode=["']?dark["']?\]/);
    expect(css).toContain('--color-bg:');
    expect(css).toContain('--color-on-primary:'); // contraste como decisión del tema
    expect(css).toContain('--space-4:');
    expect(css).toContain('@keyframes fade-in'); // motion compartido emitido
  });

  it('auth.scss compila', () => {
    expect(() => compileFile('auth.scss')).not.toThrow();
  });

  it('_sanitize-theme descarta con @warn un token fuera de la allowlist', () => {
    const warnings = [];
    // Nueva API: apply($theme) de 1 arg; el skin se deriva de `theme-name` dentro del mapa.
    sass.compileString(
      "@use 'themes/theme-manager' as theme;\n@include theme.apply(('theme-name': 'evil', 'light-mode': ('color-foobar': red)));",
      { loadPaths: [STYLES], logger: { warn: (m) => warnings.push(m), debug: () => {} } },
    );
    expect(warnings.some((w) => w.includes('color-foobar'))).toBe(true);
  });
});
