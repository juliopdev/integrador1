import InMemoryEventBus from './event-bus/in-memory.js';
import UIButtonComponent from '../components/button/ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const eventBus = new InMemoryEventBus();
  
  // ES: Inicializar todos los botones de la pantalla de login.
  const buttons = document.querySelectorAll('.auth-card__button');
  buttons.forEach(btnEl => {
    const btnComponent = new UIButtonComponent(btnEl, eventBus);
    btnComponent.mount();
  });

  eventBus.on('ui:button:click', (data) => {
    console.log('[Tenant Auth] Button clicked:', data.id);
  });
});
