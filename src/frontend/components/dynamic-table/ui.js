import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * DynamicTable: maneja las interacciones de edición/borrado de una tabla schema-driven.
 * Emite eventos `dynamic-table:edit`, `dynamic-table:delete` o `dynamic-table:menu` según el botón clickeado.
 * @module dynamic-table.ui
 * @extends {UIComponentContract}
 */
export class DynamicTable extends UIComponentContract {
  /**
   * Escucha clicks delegados en elementos con `data-action`.
   * @override
   */
  onMount() {
    this.resourceName = this.element.dataset.resource;

    this._onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'edit' || action === 'delete' || action === 'menu') {
          const payload = { resource: this.resourceName, id };
          if (action === 'menu') {
            payload.element = btn;
          }
          this.emit(`dynamic-table:${action}`, payload);
        }
      }
    };

    this.element.addEventListener('click', this._onClick);
  }

  /**
   * Remueve el listener de click.
   * @override
   */
  onDestroy() {
    this.element.removeEventListener('click', this._onClick);
  }
}
