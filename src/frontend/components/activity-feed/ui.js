import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * ActivityFeed: maneja la inyección y expurgación de hitos de actividad en tiempo real.
 * @module activity-feed.ui
 * @extends {UIComponentContract}
 */
export class ActivityFeed extends UIComponentContract {
  /**
   * Inicializa el contenedor de la lista, configura el máximo de items y escucha el evento `activity:append`.
   * @override
   */
  onMount() {
    this.listEl = this.element.querySelector('.c-activity-feed__list');
    if (!this.listEl) return;

    this.maxItems = parseInt(this.element.dataset.maxItems || '50', 10);

    this._onAppend = (payload) => {
      if (!payload) return;
      if (payload.target && payload.target !== this.element.id) return;
      this.append(payload);
    };

    this.on('activity:append', this._onAppend);
  }

  /**
   * Agrega un nuevo item de actividad al inicio de la lista. Si se excede `maxItems`, elimina el más antiguo.
   * @param {Object} [params] - Datos del item de actividad.
   * @param {string} [params.title=''] - Título del hito.
   * @param {string} [params.description=''] - Descripción opcional.
   * @param {string} [params.timestamp=''] - Marca de tiempo en formato legible.
   * @param {'info'|'success'|'warning'|'error'} [params.status='info'] - Estado visual del hito.
   */
  append({ title = '', description = '', timestamp = '', status = 'info' } = {}) {
    const item = document.createElement('div');
    item.className = 'c-activity-feed__item';
    item.dataset.status = status;
    item.innerHTML = `
      <div class="c-activity-feed__marker" aria-hidden="true"></div>
      <div class="c-activity-feed__content">
        <div class="c-activity-feed__header">
          <span class="c-activity-feed__title">${title}</span>
          ${timestamp ? `<time class="c-activity-feed__time">${timestamp}</time>` : ''}
        </div>
        ${description ? `<p class="c-activity-feed__description">${description}</p>` : ''}
      </div>
    `;

    this.listEl.insertBefore(item, this.listEl.firstChild);

    while (this.listEl.children.length > this.maxItems) {
      const lastChild = this.listEl.lastChild;
      if (lastChild) lastChild.remove();
    }
  }

  /**
   * Limpia la suscripción al bus y remueve listeners.
   * @override
   */
  onDestroy() {
    this.off('activity:append', this._onAppend);
  }
}
