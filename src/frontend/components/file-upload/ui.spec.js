// @vitest-environment jsdom
/**
 * Pruebas del componente FileUpload.
 * Verifica selección de archivos, validación de tamaño/tipo y previsualización.
 *
 * @module FileUploadSpec
 */
import { describe, it, expect, vi } from 'vitest';
import { FileUpload } from './ui.js';

function mount(maxSize = 2) {
  document.body.innerHTML = `
    <div class="c-file-upload" data-max-size="${maxSize}">
      <input type="file" class="c-file-upload__input" />
      <div class="c-file-upload__list"></div>
    </div>`;
  const upload = new FileUpload(document.querySelector('.c-file-upload'));
  upload.mount();
  return upload;
}

describe('FileUpload', () => {
  it('se monta y cachea los elementos', () => {
    const upload = mount();
    expect(upload.input).toBeTruthy();
    expect(upload.listEl).toBeTruthy();
  });

  it('cambia la clase c-file-upload--dragover al arrastrar archivos', () => {
    const upload = mount();
    const dragEvent = new Event('dragover');
    upload.element.dispatchEvent(dragEvent);
    expect(upload.element.classList.contains('c-file-upload--dragover')).toBe(true);

    const leaveEvent = new Event('dragleave');
    upload.element.dispatchEvent(leaveEvent);
    expect(upload.element.classList.contains('c-file-upload--dragover')).toBe(false);
  });

  it('procesa archivos seleccionados y los lista', () => {
    const upload = mount(5);
    const file = new File(['content'], 'test.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 1024 * 1024 }); // 1MB

    upload.handleFiles([file]);

    expect(upload.filesList.length).toBe(1);
    const item = upload.listEl.querySelector('.c-file-upload__file');
    expect(item).toBeTruthy();
    expect(item.querySelector('.c-file-upload__file-name').textContent).toBe('test.png');
    expect(item.querySelector('.c-file-upload__file-size').textContent).toBe('1 MB');
  });

  it('muestra un toast de error si el archivo supera el limite de tamaño', () => {
    const upload = mount(1);
    const emitSpy = vi.spyOn(upload, 'emit');

    const file = new File(['content'], 'huge.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 }); // 2MB

    upload.handleFiles([file]);

    expect(upload.filesList.length).toBe(0);
    expect(emitSpy).toHaveBeenCalledWith('toast', {
      variant: 'error',
      message: 'El archivo "huge.zip" supera el tamaño máximo de 1 MB.'
    });
  });

  it('elimina un archivo al presionar el boton de eliminar', () => {
    const upload = mount(5);
    const file = new File(['content'], 'test.png', { type: 'image/png' });
    upload.handleFiles([file]);

    expect(upload.filesList.length).toBe(1);
    const removeBtn = upload.listEl.querySelector('.c-file-upload__file-remove');

    removeBtn.dispatchEvent(new Event('click', { bubbles: true }));

    expect(upload.filesList.length).toBe(0);
    expect(upload.listEl.children.length).toBe(0);
  });
});
