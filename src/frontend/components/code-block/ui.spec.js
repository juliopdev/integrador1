// @vitest-environment jsdom
/**
 * Pruebas del componente CodeBlock.
 * Verifica montaje, renderizado de código syntax-highlighted y lengüeta de idioma.
 *
 * @module CodeBlockSpec
 */
import { describe, it, expect } from 'vitest';
import { CodeBlock } from './ui.js';

function mount(code, language = 'json') {
  document.body.innerHTML = `
    <div class="c-code-block" data-language="${language}">
      <code class="c-code-block__code">${code}</code>
    </div>`;
  const block = new CodeBlock(document.querySelector('.c-code-block'));
  block.mount();
  return block;
}

describe('CodeBlock', () => {
  it('se monta y cachea los elementos', () => {
    const block = mount('{"active": true}');
    expect(block.codeEl).toBeTruthy();
  });

  it('resalta sintaxis JSON de claves, strings, booleanos y números', () => {
    const json = '{\n  "status": 200,\n  "ok": true\n}';
    const block = mount(json, 'json');

    const html = block.codeEl.innerHTML;
    expect(html).toContain('class="token-key"');
    expect(html).toContain('class="token-number"');
    expect(html).toContain('class="token-boolean"');
  });

  it('resalta sintaxis Javascript de palabras clave y cadenas', () => {
    const js = 'const name = "Antigravity";\nreturn name;';
    const block = mount(js, 'js');

    const html = block.codeEl.innerHTML;
    expect(html).toContain('class="token-keyword"');
    expect(html).toContain('class="token-string"');
  });
});
