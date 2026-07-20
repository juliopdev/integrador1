// @vitest-environment jsdom
/**
 * Pruebas del componente ChatBox.
 * Verifica envío de mensajes, recepción en tiempo real y scroll automático.
 *
 * @module ChatBoxSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { ChatBox } from './ui.js';

function mount() {
  document.body.innerHTML = `
    <div class="c-chat-box" id="chat">
      <div class="c-chat-box__body">
        <div class="js-chat-messages"></div>
      </div>
      <form class="js-chat-form">
        <input type="text" name="message" class="js-chat-input" value="">
        <button type="submit">Send</button>
      </form>
    </div>`;
  const chat = new ChatBox(document.getElementById('chat'));
  chat.mount();
  return chat;
}

describe('ChatBox', () => {
  it('se monta correctamente', () => {
    const chat = mount();
    expect(chat.messagesEl).toBeTruthy();
  });

  it('envía mensajes al hacer submit y limpia el input', () => {
    const chat = mount();
    const emitSpy = vi.spyOn(chat, 'emit');

    chat.inputEl.value = 'Hello world';
    chat.formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(emitSpy).toHaveBeenCalledWith('chat:send', expect.objectContaining({
      text: 'Hello world'
    }));

    const sentMsg = chat.messagesEl.querySelector('.c-chat-box__message-wrapper--sent');
    expect(sentMsg).toBeTruthy();
    expect(sentMsg.querySelector('.c-chat-box__text').textContent).toBe('Hello world');
    expect(chat.inputEl.value).toBe('');
  });

  it('recibe mensajes del bus y los pinta como recibidos', () => {
    const chat = mount();
    
    chat.emit('chat:message', {
      text: 'Response message',
      timestamp: '16:05'
    });

    const receivedMsg = chat.messagesEl.querySelector('.c-chat-box__message-wrapper--received');
    expect(receivedMsg).toBeTruthy();
    expect(receivedMsg.querySelector('.c-chat-box__text').textContent).toBe('Response message');
  });
});
