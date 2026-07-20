import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

const DEFAULT_MAX_LINES = 200;
// Backoff exponencial acotado: 1s, 2s, 4s, 8s, 16s, 30s (cap). Reset al reconectar OK.
const RECONNECT_STEPS_MS = [1000, 2000, 4000, 8000, 16_000, 30_000];

/**
 * Terminal / consola de logs con soporte para:
 *  - **SSE streaming** (`data-sse-src`): abre `EventSource`, reconecta con backoff exponencial,
 *    pinta el estado (`● live` / `○ conectando` / `○ desconectado`).
 *  - **Bus interno** `terminal:write` para dispatchers que no vengan de SSE.
 *  - **Auto-scroll con pausa**: el operador congela el scroll con el botón "Pausar" para leer
 *    el buffer sin que el stream le mueva la vista; nuevo evento des-pausa NO ocurre — se
 *    despausa con el botón. Nueva línea agrega al final igual, pero no fuerza scroll.
 *  - **Parser ANSI** (para strings crudos) o **payload JSON** (`{level, message, createdAt}`)
 *    que vienen del endpoint SSE del backend — el widget elige el modo por shape.
 *
 * A11y: el `__body` es `role="log" aria-live="polite"`. Nuevas líneas se anuncian sin
 * interrumpir. `aria-pressed` en el botón de pausa refleja el estado real.
 * @module terminal.ui
 * @extends {UIComponentContract}
 */
export class Terminal extends UIComponentContract {
  /**
   * Inicializa el contenedor, configura SSE, botón de pausa y suscripción al bus `terminal:write`.
   * @override
   */
  onMount() {
    this.bodyEl = this.element.querySelector('.c-terminal__body');
    this.outputEl = this.element.querySelector('.c-terminal__output');
    this.statusEl = this.element.querySelector('.c-terminal__status');
    this.statusLabelEl = this.element.querySelector('.c-terminal__status-label');
    this.pauseBtn = this.element.querySelector('[data-action="terminal:toggle-autoscroll"]');
    if (!this.bodyEl || !this.outputEl) return;

    this.maxLines = parseInt(this.element.dataset.maxLines || DEFAULT_MAX_LINES, 10);
    this.autoScroll = true;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;

    // Bus interno: emisor puede pasar `{ line }` (string crudo) o `{ level, message }` (formato
    // estructurado). El widget resuelve.
    this._onWrite = (payload) => {
      if (!payload || (payload.target && payload.target !== this.element.id)) return;
      if (typeof payload.line === 'string') {
        this.writeRaw(payload.line);
      } else if (payload.level && payload.message) {
        this.writeStructured(payload);
      }
    };
    this.on('terminal:write', this._onWrite);

    // Botón de pausa: se maneja con listener directo (no bus) porque el estado vive dentro del
    // widget y no interesa a nadie más.
    if (this.pauseBtn) {
      this._onPauseToggle = () => this.togglePause();
      this.pauseBtn.addEventListener('click', this._onPauseToggle);
    }

    this.sseSrc = this.element.dataset.sseSrc;
    if (this.sseSrc) this.connectSSE();
  }

  // ── Estado visible ──────────────────────────────────────────────────
  /**
   * Actualiza el indicador visual de estado de conexión SSE.
   * @param {'connecting'|'live'|'disconnected'|'static'} kind - Estado del terminal.
   * @param {string} label - Texto descriptivo del estado.
   */
  setStatus(kind, label) {
    if (!this.statusEl) return;
    this.statusEl.classList.remove(
      'c-terminal__status--connecting',
      'c-terminal__status--live',
      'c-terminal__status--disconnected',
      'c-terminal__status--static',
    );
    this.statusEl.classList.add(`c-terminal__status--${kind}`);
    if (this.statusLabelEl) this.statusLabelEl.textContent = label;
  }

  // ── SSE ─────────────────────────────────────────────────────────────
  /**
   * Conecta al endpoint SSE configurado en `data-sse-src` y maneja reconexión con backoff exponencial.
   */
  connectSSE() {
    if (typeof EventSource === 'undefined') {
      this.setStatus('disconnected', 'SSE no soportado');
      return;
    }
    this.setStatus('connecting', 'Conectando…');
    try {
      this.eventSource = new EventSource(this.sseSrc);

      // Handshake explícito del server: pinta "● live" en cuanto llega.
      this.eventSource.addEventListener('connected', () => {
        this.reconnectAttempt = 0;
        this.setStatus('live', '● Live');
      });

      // Log real: siempre JSON estructurado desde el backend.
      this.eventSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const payload = JSON.parse(event.data);
          this.writeStructured(payload);
        } catch {
          // Compat: si el server envía texto plano (o alguien reusa el widget con otro backend),
          // caemos al parser ANSI.
          this.writeRaw(event.data);
        }
      };

      this.eventSource.onerror = () => {
        // EventSource reintenta solo pero sin backoff configurable; cerramos y programamos
        // reconexión propia para tener control del delay y del feedback visual.
        this.disconnectAndScheduleReconnect();
      };
    } catch {
      this.disconnectAndScheduleReconnect();
    }
  }

  /**
   * Cierra la conexión SSE actual y programa una reconexión con backoff exponencial.
   */
  disconnectAndScheduleReconnect() {
    if (this.eventSource) {
      try { this.eventSource.close(); } catch { /* noop */ }
      this.eventSource = null;
    }
    const step = Math.min(this.reconnectAttempt, RECONNECT_STEPS_MS.length - 1);
    const delay = RECONNECT_STEPS_MS[step];
    this.reconnectAttempt++;
    this.setStatus('disconnected', `○ Reconectando en ${Math.round(delay / 1000)}s…`);
    this.reconnectTimer = setTimeout(() => this.connectSSE(), delay);
  }

  // ── Escritura ───────────────────────────────────────────────────────
  /** Log estructurado del server: `{ level, message, createdAt }`. Prefija hora + colorea nivel. */
  /**
   * Renderiza una línea de log estructurado con nivel, timestamp y mensaje. Emite `log:received`.
   * @param {Object} payload - Datos del log estructurado.
   * @param {string} payload.level - Nivel del log (info, warn, error, debug).
   * @param {string} payload.message - Contenido del mensaje.
   * @param {string} [payload.createdAt] - Timestamp ISO de creación.
   */
  writeStructured({ level, message, createdAt }) {
    // Iter UX A2: broadcast al bus para que otros widgets (contadores del filtro de logs)
    // reaccionen sin abrir su propio EventSource. Consumer principal: dashboard.entry.js
    // que actualiza los pills de `/dashboard/logs`.
    this.emit('log:received', { level, message, createdAt });

    const time = new Date(createdAt || Date.now()).toLocaleTimeString('es-PE', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const line = document.createElement('div');
    line.className = `c-terminal__line c-terminal__line--${level}`;

    const timeEl = document.createElement('span');
    timeEl.className = 'c-terminal__line-time';
    timeEl.textContent = `[${time}]`;

    const levelEl = document.createElement('span');
    levelEl.className = `c-terminal__line-level c-terminal__line-level--${level}`;
    levelEl.textContent = level.toUpperCase().padEnd(5);

    const msgEl = document.createElement('span');
    msgEl.className = 'c-terminal__line-msg';
    msgEl.textContent = message;

    line.append(timeEl, ' ', levelEl, ' ', msgEl);
    this.appendLine(line);
  }

  /**
   * Escribe una línea de texto crudo en el terminal (alias de writeRaw).
   * @param {string} [lineText=''] - Texto a escribir.
   */
  write(lineText = '') {
    this.writeRaw(lineText);
  }

  /** Texto crudo con ANSI (compat con emisores que no envían JSON estructurado). */
  /**
   * Escribe texto crudo con parseo ANSI básico en el terminal.
   * @param {string} [lineText=''] - Texto plano posiblemente con códigos ANSI.
   */
  writeRaw(lineText = '') {
    const segments = this.parseAnsi(lineText);
    const line = document.createElement('div');
    line.className = 'c-terminal__line';
    for (const { text, color } of segments) {
      if (!text) continue;
      const span = document.createElement('span');
      if (color) span.className = `c-terminal__ansi--${color}`;
      span.textContent = text;
      line.appendChild(span);
    }
    this.appendLine(line);
  }

  /**
   * Agrega un elemento de línea al terminal, controla el máximo de líneas y el auto-scroll.
   * @param {HTMLElement} lineEl - Elemento DOM de la línea a agregar.
   */
  appendLine(lineEl) {
    this.outputEl.appendChild(lineEl);
    while (this.outputEl.children.length > this.maxLines) {
      const first = this.outputEl.firstChild;
      if (!first) break;
      first.remove();
    }
    if (this.autoScroll) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  /**
   * Parser ANSI que respeta segmentos múltiples por línea (el anterior sólo capturaba el primer
   * color y perdía el resto). Reconoce escape codes básicos (30-37 foreground, 0 reset).
   * No soporta bright/bold combos — para el uso "logs" alcanza.
   */
  /**
   * Parsea una cadena con códigos ANSI básicos (30-37, 90-97 foreground, 0 reset) y devuelve segmentos.
   * @param {string} text - Texto con códigos de escape ANSI.
   * @returns {Array<{text: string, color: string|null}>} Segmentos con color aplicable.
   * @example
   * parseAnsi('\x1b[31merror\x1b[0m') // Devuelve [{ text: 'error', color: 'red' }]
   */
  parseAnsi(text) {
    const ANSI_RE = /\x1b\[([0-9;]*)m/g;
    const COLOR_MAP = {
      31: 'red', 32: 'green', 33: 'yellow', 34: 'blue', 35: 'magenta', 36: 'cyan',
      91: 'red', 92: 'green', 93: 'yellow', 94: 'blue', 95: 'magenta', 96: 'cyan',
    };
    const segments = [];
    let cursor = 0;
    let currentColor = null;
    let m;
    while ((m = ANSI_RE.exec(text)) !== null) {
      if (m.index > cursor) {
        segments.push({ text: text.slice(cursor, m.index), color: currentColor });
      }
      const codes = m[1].split(';').filter(Boolean);
      for (const code of codes) {
        const n = Number(code);
        if (n === 0) currentColor = null;
        else if (COLOR_MAP[n]) currentColor = COLOR_MAP[n];
      }
      cursor = m.index + m[0].length;
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), color: currentColor });
    }
    return segments;
  }

  // ── Pausa de auto-scroll ────────────────────────────────────────────
  /**
   * Alterna el auto-scroll y actualiza el estado aria-pressed del botón.
   */
  togglePause() {
    this.autoScroll = !this.autoScroll;
    if (!this.pauseBtn) return;
    this.pauseBtn.setAttribute('aria-pressed', String(!this.autoScroll));
    const labelEl = this.pauseBtn.querySelector('.c-terminal__pause-label');
    if (labelEl) labelEl.textContent = this.autoScroll ? 'Pausar' : 'Reanudar';
  }

  /**
   * Limpia suscripciones al bus, cierra SSE, cancela reconexión y remueve listeners.
   * @override
   */
  onDestroy() {
    this.off('terminal:write', this._onWrite);
    if (this.pauseBtn && this._onPauseToggle) {
      this.pauseBtn.removeEventListener('click', this._onPauseToggle);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      try { this.eventSource.close(); } catch { /* noop */ }
      this.eventSource = null;
    }
  }
}
