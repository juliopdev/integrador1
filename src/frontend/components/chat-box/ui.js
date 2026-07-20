import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * ChatBox: controla el envío y recepción interactiva de burbujas en tiempo real.
 * Emite `chat:send` al enviar un mensaje y escucha `chat:message` para recibir.
 * @module chat-box.ui
 * @extends {UIComponentContract}
 */
export class ChatBox extends UIComponentContract {
  /**
   * Inicializa los elementos del formulario, scroll y suscripciones al bus.
   * @override
   */
  onMount() {
    this.messagesEl = this.element.querySelector('.js-chat-messages');
    this.formEl = this.element.querySelector('.js-chat-form');
    this.inputEl = this.element.querySelector('.js-chat-input');
    this.bodyEl = this.element.querySelector('.c-chat-box__body');

    if (!this.messagesEl || !this.formEl || !this.inputEl || !this.bodyEl) return;

    this._onSubmit = (e) => {
      e.preventDefault();
      const text = this.inputEl.value.trim();
      if (!text) return;

      const now = new Date();
      const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      this.emit('chat:send', { text, timestamp });
      this.append({ text, own: true, timestamp });
      this.inputEl.value = '';
    };

    this._onMessageReceived = (payload) => {
      if (!payload) return;
      this.append({
        text: payload.text,
        own: false,
        timestamp: payload.timestamp
      });
    };

    this.formEl.addEventListener('submit', this._onSubmit);
    this.on('chat:message', this._onMessageReceived);

    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  /**
   * Agrega una burbuja de mensaje al contenedor y hace scroll al final.
   * @param {Object} [params] - Datos del mensaje.
   * @param {string} [params.text=''] - Contenido del mensaje.
   * @param {boolean} [params.own=false] - Indica si es un mensaje propio (sent) o recibido.
   * @param {string} [params.timestamp=''] - Marca de tiempo en formato HH:mm.
   */
  append({ text = '', own = false, timestamp = '' } = {}) {
    const msg = document.createElement('div');
    msg.className = `c-chat-box__message-wrapper c-chat-box__message-wrapper--${own ? 'sent' : 'received'}`;
    msg.innerHTML = `
      <div class="c-chat-box__bubble">
        <p class="c-chat-box__text">${this.escapeHtml(text)}</p>
        ${timestamp ? `<time class="c-chat-box__time">${timestamp}</time>` : ''}
      </div>
    `;

    this.messagesEl.appendChild(msg);
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  /**
   * Escapa caracteres HTML para prevenir XSS en los mensajes.
   * @param {string} text - Texto plano a escapar.
   * @returns {string} Texto escapado seguro para innerHTML.
   * @example
   * escapeHtml('<script>') // Devuelve '&lt;script&gt;'
   */
  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Limpia listeners del formulario y del bus.
   * @override
   */
  onDestroy() {
    if (this.formEl) {
      this.formEl.removeEventListener('submit', this._onSubmit);
    }
    this.off('chat:message', this._onMessageReceived);
  }
}
