import { bus } from './bus.js';

/**
 * Dispatcher delegado global: un único listener lee `data-action` de los clicks y lo emite al bus,
 * para que cualquier componente con comportamiento reaccione. Ver components.md.
 * @param {Document|HTMLElement} [root=document] - Contexto donde se delega el evento de click.
 */
export function initDispatcher(root = document) {
  root.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    bus.emit(el.dataset.action, { target: el.dataset.target ?? null, el, event });
  });
}
