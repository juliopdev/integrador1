// @vitest-environment jsdom
/**
 * Pruebas del componente ActivityFeed.
 * Verifica montaje correcto, emisión de eventos activity:append,
 * renderizado de hitos y expurgo del historial según maxItems.
 *
 * @module ActivityFeedSpec
 */
import { describe, it, expect } from 'vitest';
import { ActivityFeed } from './ui.js';

/**
 * Monta el componente ActivityFeed en el DOM virtual.
 * @param {number} [maxItems=3] - Máximo de hitos visibles.
 * @returns {ActivityFeed} Instancia montada.
 */
function mount(maxItems = 3) {
  document.body.innerHTML = `
    <div class="c-activity-feed" id="my-feed" data-max-items="${maxItems}">
      <div class="c-activity-feed__list"></div>
    </div>`;
  const feed = new ActivityFeed(document.getElementById('my-feed'));
  feed.mount();
  return feed;
}

describe('ActivityFeed', () => {
  it('se monta correctamente', () => {
    const feed = mount();
    expect(feed.listEl).toBeTruthy();
  });

  it('añade hitos de actividad al recibir el evento en el bus', () => {
    const feed = mount();
    
    feed.emit('activity:append', {
      target: 'my-feed',
      title: 'Despliegue iniciado',
      description: 'Creando VPS...',
      timestamp: '14:50',
      status: 'pending'
    });

    const item = feed.listEl.querySelector('.c-activity-feed__item');
    expect(item).toBeTruthy();
    expect(item.dataset.status).toBe('pending');
    expect(item.querySelector('.c-activity-feed__title').textContent).toBe('Despliegue iniciado');
    expect(item.querySelector('.c-activity-feed__description').textContent).toBe('Creando VPS...');
  });

  it('limita el historial máximo expurgando elementos antiguos', () => {
    const feed = mount(2);

    feed.append({ title: 'Item 1' });
    feed.append({ title: 'Item 2' });
    feed.append({ title: 'Item 3' });

    expect(feed.listEl.children.length).toBe(2);
    expect(feed.listEl.firstChild.querySelector('.c-activity-feed__title').textContent).toBe('Item 3');
    expect(feed.listEl.lastChild.querySelector('.c-activity-feed__title').textContent).toBe('Item 2');
  });
});
