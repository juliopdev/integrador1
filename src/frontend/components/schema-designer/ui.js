import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * SchemaDesigner: permite la edición interactiva de esquemas de tablas No-Code.
 * Emite `schema:change` al agregar/eliminar campos.
 * @module schema-designer.ui
 * @extends {UIComponentContract}
 */
export class SchemaDesigner extends UIComponentContract {
  /**
   * Lee campos iniciales de `data-initial`, registra listeners y renderiza la lista.
   * @override
   */
  onMount() {
    this.listEl = this.element.querySelector('.js-designer-list');
    this.inputEl = this.element.querySelector('.js-designer-input');
    this.addBtn = this.element.querySelector('.js-designer-add');

    if (!this.listEl || !this.inputEl) return;

    let initial = [];
    try {
      initial = JSON.parse(this.element.dataset.initial || '[]');
    } catch (e) {
      initial = [];
    }

    this.fields = initial;

    this._onAddClick = () => {
      this.addField();
    };

    this._onListClick = (e) => {
      const btn = e.target.closest('[data-delete-id]');
      if (btn) {
        const id = btn.dataset.deleteId;
        this.removeField(id);
      }
    };

    if (this.addBtn) {
      this.addBtn.addEventListener('click', this._onAddClick);
    }
    this.listEl.addEventListener('click', this._onListClick);

    this.renderList();
  }

  /**
   * Agrega un nuevo campo al esquema si pasa las validaciones de nombre y unicidad.
   */
  addField() {
    const nameInput = this.element.querySelector('.js-designer-name input');
    const typeSelect = this.element.querySelector('.js-designer-type');
    const reqInput = this.element.querySelector('.js-designer-required input');

    if (!nameInput || !typeSelect) return;

    const name = nameInput.value.trim().toLowerCase();
    if (!name) return;

    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      this.emit('toast', { variant: 'error', message: 'Nombre de columna inválido (solo letras, números y _).' });
      return;
    }

    if (this.fields.some(f => f.name === name)) {
      this.emit('toast', { variant: 'error', message: 'Esa columna ya existe.' });
      return;
    }

    const type = typeSelect.value;
    const required = reqInput ? reqInput.checked : false;

    this.fields.push({
      id: `f-${Date.now()}`,
      name,
      type,
      required
    });

    nameInput.value = '';
    if (reqInput) reqInput.checked = false;

    this.save();
    this.renderList();
  }

  /**
   * Elimina un campo del esquema por su id.
   * @param {string} id - Identificador del campo a eliminar.
   */
  removeField(id) {
    this.fields = this.fields.filter(f => f.id !== id);
    this.save();
    this.renderList();
  }

  /**
   * Persiste el estado actual de campos en el input oculto y emite `schema:change`.
   */
  save() {
    const json = JSON.stringify(this.fields);
    this.inputEl.value = json;
    this.emit('schema:change', { fields: this.fields, json });
  }

  /**
   * Renderiza la lista de campos del esquema en el DOM.
   */
  renderList() {
    if (this.fields.length === 0) {
      this.listEl.innerHTML = `
        <div style="padding: var(--space-4); text-align: center; color: var(--color-text-muted); font-size: var(--font-size-sm);">
          Sin columnas registradas. Añade una arriba.
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = this.fields.map(f => `
      <div class="c-schema-designer__item" data-field-name="${f.name}">
        <div class="c-schema-designer__item-details">
          <span class="c-schema-designer__item-name">${f.name}</span>
          <span class="c-schema-designer__item-badge">${f.type}</span>
          ${f.required ? `<span class="c-schema-designer__item-badge c-schema-designer__item-badge--required">required</span>` : ''}
        </div>
        <button type="button" class="c-button c-button--ghost c-button--destructive c-button--sm" data-delete-id="${f.id}">
          Eliminar
        </button>
      </div>
    `).join('');
  }

  /**
   * Limpia listeners de botones y lista.
   * @override
   */
  onDestroy() {
    if (this.addBtn) {
      this.addBtn.removeEventListener('click', this._onAddClick);
    }
    if (this.listEl) {
      this.listEl.removeEventListener('click', this._onListClick);
    }
  }
}
