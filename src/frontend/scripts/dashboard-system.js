import InMemoryEventBus from './event-bus/in-memory.js';
import UIButtonComponent from '../components/button/ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const eventBus = new InMemoryEventBus();
  
  // ES: Inicializar todos los botones dentro del dashboard del Superadmin.
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(btnEl => {
    const btnComponent = new UIButtonComponent(btnEl, eventBus);
    btnComponent.mount();
  });

  eventBus.on('ui:button:click', (data) => {
    console.log('[System Dashboard] Button clicked:', data.id);
  });
});
