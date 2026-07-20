import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * CodeBlock: aplica un formateo sintáctico ligero y rápido a bloques de código.
 * Soporta resaltado para JSON y JavaScript/JS.
 * @module code-block.ui
 * @extends {UIComponentContract}
 */
export class CodeBlock extends UIComponentContract {
  /**
   * Obtiene el elemento `<code>` y aplica el resaltado inicial.
   * @override
   */
  onMount() {
    this.codeEl = this.element.querySelector('.c-code-block__code');
    if (!this.codeEl) return;

    this.language = this.element.dataset.language || 'json';
    this.highlightCode();
  }

  /**
   * Lee el texto plano del bloque y lo reemplaza por HTML resaltado.
   */
  highlightCode() {
    const raw = this.codeEl.textContent;
    this.codeEl.innerHTML = this.highlight(raw, this.language);
  }

  /**
   * Resalta la sintaxis según el lenguaje usando expresiones regulares.
   * @param {string} code - Código fuente plano.
   * @param {string} lang - Lenguaje ('json', 'javascript', 'js' u otro).
   * @returns {string} HTML con spans de clases semánticas (token-key, token-string, token-number, etc.).
   * @example
   * highlight('{"key": 42}', 'json')
   * // Devuelve '<span class="token-key">key</span>: <span class="token-number">42</span>'
   */
  highlight(code, lang) {
    const escaped = this.escapeHtml(code);
    
    if (lang === 'json') {
      return escaped.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (match) => {
        let cls = 'token-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'token-key';
            return `<span class="${cls}">${match.replace(/:$/, '')}</span>:`;
          } else {
            cls = 'token-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'token-boolean';
        } else if (/null/.test(match)) {
          cls = 'token-keyword';
        }
        return `<span class="${cls}">${match}</span>`;
      });
    }

    if (lang === 'javascript' || lang === 'js') {
      const regex = /(\/\/.*)|(["'`])(.*?)\2|\b(const|let|var|function|return|if|else|for|while|class|export|import|from|async|await|new|try|catch|true|false)\b|(\b\d+\b)/g;
      return escaped.replace(regex, (match, comment, quote, string, keyword, number) => {
        if (comment) return `<span class="token-comment">${comment}</span>`;
        if (quote) return `<span class="token-string">${quote}${string}${quote}</span>`;
        if (keyword) return `<span class="token-keyword">${keyword}</span>`;
        if (number) return `<span class="token-number">${number}</span>`;
        return match;
      });
    }

    return escaped;
  }

  /**
   * Escapa caracteres HTML para prevenir XSS.
   * @param {string} text - Texto plano a escapar.
   * @returns {string} Texto escapado.
   */
  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
