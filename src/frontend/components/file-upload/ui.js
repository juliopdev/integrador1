import { UIComponentContract } from '../../scripts/contracts/ui-component.contract.js';

/**
 * FileUpload: Maneja el arrastre, validación y lista visual de archivos cargados.
 * Soporta drag & drop, selección por input, validación de tamaño y sincronización con FormData.
 * @module file-upload.ui
 * @extends {UIComponentContract}
 */
export class FileUpload extends UIComponentContract {
  /**
   * Configura los eventos de drag & drop, change y botones de eliminar.
   * @override
   */
  onMount() {
    this.input = this.element.querySelector('.c-file-upload__input');
    this.listEl = this.element.querySelector('.c-file-upload__list');

    if (!this.input || !this.listEl) return;

    this.maxSizeMB = parseInt(this.element.dataset.maxSize || '5', 10);
    this.filesList = [];

    this._onDragOver = (e) => {
      e.preventDefault();
      if (this.element.dataset.disabled !== 'true') {
        this.element.classList.add('c-file-upload--dragover');
      }
    };

    this._onDragLeave = (e) => {
      e.preventDefault();
      this.element.classList.remove('c-file-upload--dragover');
    };

    this._onDrop = (e) => {
      e.preventDefault();
      this.element.classList.remove('c-file-upload--dragover');
      if (this.element.dataset.disabled === 'true' || !e.dataTransfer?.files?.length) return;
      // Fix P5: transferir el archivo al <input type="file"> real. Sin esto, el drop actualiza
      // sólo el state interno del componente + la UI, pero `new FormData(form)` en el submit
      // ignora el input (el browser no lo asocia automáticamente al drop sobre el label). El
      // truco es usar `DataTransfer` para construir un `FileList` y asignarlo a `input.files`.
      this.setInputFiles(e.dataTransfer.files);
      this.handleFiles(e.dataTransfer.files);
    };

    this._onChange = (e) => {
      // Evitar bucle infinito si disparamos change internamente
      if (e.isTriggeredInternally) return;
      if (e.target.files) {
        this.handleFiles(e.target.files);
      }
    };

    this._onListClick = (e) => {
      const removeBtn = e.target.closest('.c-file-upload__file-remove');
      if (removeBtn) {
        const fileItem = removeBtn.closest('.c-file-upload__file');
        if (fileItem) {
          this.removeFile(fileItem.id);
        }
      }
    };

    this.element.addEventListener('dragover', this._onDragOver);
    this.element.addEventListener('dragleave', this._onDragLeave);
    this.element.addEventListener('drop', this._onDrop);
    this.input.addEventListener('change', this._onChange);
    this.listEl.addEventListener('click', this._onListClick);
  }

  /**
   * Procesa los archivos recibidos: valida tamaño, agrega a la UI y sincroniza el input.
   * @param {FileList|Array<File>} files - Archivos a procesar.
   */
  handleFiles(files) {
    const isMultiple = this.input.hasAttribute('multiple');

    if (!isMultiple && files.length > 0) {
      this.clearAll();
    }

    Array.from(files).forEach(file => {
      if (file.size > this.maxSizeMB * 1024 * 1024) {
        this.emit('toast', {
          variant: 'error',
          message: `El archivo "${file.name}" supera el tamaño máximo de ${this.maxSizeMB} MB.`
        });
        return;
      }

      const fileId = 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      this.addFileUI(fileId, file);
      this.filesList.push({ id: fileId, file });
    });

    // Fix P6: re-sincronizar el input con lo que quedó en filesList (post-clearAll + filtros por
    // tamaño). Sin esto, el `clearAll` al principio dejaba el input vacío y el submit fallaba
    // aún cuando el usuario había seleccionado un archivo válido — bug reportado en /frontends
    // "Se requiere un archivo .zip o .rar".
    this.setInputFiles(this.filesList.map(f => f.file));

    // Disparar evento de cambio de forma controlada
    const changeEvent = new Event('change', { bubbles: true });
    changeEvent.isTriggeredInternally = true;
    this.input.dispatchEvent(changeEvent);
  }

  /**
   * Agrega un elemento visual de archivo a la lista con animación de progreso.
   * @param {string} fileId - Identificador único del archivo.
   * @param {File} file - Objeto File del navegador.
   */
  addFileUI(fileId, file) {
    const item = document.createElement('div');
    item.className = 'c-file-upload__file';
    item.id = fileId;
    item.innerHTML = `
      <div class="c-file-upload__file-info">
        <span class="c-file-upload__file-name">${file.name}</span>
        <span class="c-file-upload__file-size">${this.formatSize(file.size)}</span>
      </div>
      <div class="c-file-upload__file-progress-track">
        <div class="c-file-upload__file-progress-bar"></div>
      </div>
      <button type="button" class="c-file-upload__file-remove" aria-label="Eliminar archivo">
        &times;
      </button>
    `;
    this.listEl.appendChild(item);

    const bar = item.querySelector('.c-file-upload__file-progress-bar');
    let percent = 0;
    const interval = setInterval(() => {
      percent += 20;
      if (bar) bar.style.width = percent + '%';
      if (percent >= 100) {
        clearInterval(interval);
      }
    }, 50);
  }

  /**
   * Fix P6: reconstruye `input.files` desde una lista de File objects. Usa `DataTransfer` que es
   * la única API estándar para setear `FileList` programáticamente. Sin esto, el archivo que el
   * usuario dropeó (o los que quedaron tras remove) no viajan en el submit del form.
   */
  /**
   * Reconstruye programáticamente `input.files` usando DataTransfer para sincronizar drag & drop con el submit.
   * @param {Array<File>} files - Archivos a asignar al input.
   */
  setInputFiles(files) {
    try {
      const dt = new DataTransfer();
      for (const f of Array.from(files)) dt.items.add(f);
      this.input.files = dt.files;
    } catch {
      // DataTransfer no está disponible en todos los navegadores viejos; degrada limpio.
    }
  }

  /**
   * Elimina un archivo de la lista visual y sincroniza el input.
   * @param {string} fileId - Identificador del archivo a eliminar.
   */
  removeFile(fileId) {
    const item = this.listEl.querySelector(`#${fileId}`);
    if (item) {
      item.remove();
    }
    this.filesList = this.filesList.filter(f => f.id !== fileId);
    // Sincronizar input.files con lo que queda (sino el submit incluye el archivo que el usuario
    // eliminó de la lista visual).
    this.setInputFiles(this.filesList.map(f => f.file));
  }

  /**
   * Limpia todos los archivos de la lista y el input.
   */
  clearAll() {
    this.listEl.innerHTML = '';
    this.filesList = [];
    // El input queda vacío también — sin esto, un submit tras "quitar todo" mandaría el último
    // archivo seleccionado por click (que sí quedó en input.files).
    this.setInputFiles([]);
  }

  /**
   * Formatea un tamaño en bytes a unidad legible (Bytes, KB, MB, GB).
   * @param {number} bytes - Tamaño en bytes.
   * @returns {string} Tamaño formateado con unidad.
   * @example
   * formatSize(2048) // Devuelve '2 KB'
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Limpia todos los listeners de drag, drop, change y click.
   * @override
   */
  onDestroy() {
    this.element.removeEventListener('dragover', this._onDragOver);
    this.element.removeEventListener('dragleave', this._onDragLeave);
    this.element.removeEventListener('drop', this._onDrop);
    if (this.input) {
      this.input.removeEventListener('change', this._onChange);
    }
    if (this.listEl) {
      this.listEl.removeEventListener('click', this._onListClick);
    }
  }
}
