import { describe, it, expect, vi } from 'vitest';
import { makeUploadDynamicAsset } from '../application/upload-dynamic-asset.usecase.js';
import { DomainError } from '../../../common/errors.js';

const resource = {
  name: 'products', physicalName: 'products_db', store: 'sql',
  fields: [
    { id: 'f1', name: 'title', type: 'string', required: true },
    { id: 'f2', name: 'hero',  type: 'asset', provider: 'cloudinary' },
    { id: 'f3', name: 'doc',   type: 'asset', provider: 'cloudinary' },
  ],
};

function makeDeps({ storeStub, resolveStub } = {}) {
  const store = storeStub ?? { uploadBuffer: vi.fn(async () => ({ publicId: 'pid', url: 'https://res.cloudinary.com/…/pid.png', bytes: 42, format: 'png' })) };
  const resolveAssetStore = resolveStub ?? vi.fn(async () => store);
  return { store, resolveAssetStore, tenantId: 't1', tenantDb: {} };
}

describe('upload-dynamic-asset.usecase — validaciones + upload', () => {
  const buffer = Buffer.alloc(1024, 0);

  it('field asset válido + mime imagen + tamaño OK → sube y devuelve { url, publicId }', async () => {
    const deps = makeDeps();
    const usecase = makeUploadDynamicAsset(deps);
    const result = await usecase({ resource, fieldName: 'hero', buffer, mimeType: 'image/png', filename: 'foo.png' });

    expect(deps.resolveAssetStore).toHaveBeenCalledWith({ tenantId: 't1', tenantDb: {}, provider: 'cloudinary' });
    expect(deps.store.uploadBuffer).toHaveBeenCalledWith(expect.objectContaining({
      buffer,
      folder: 't1/products_db/hero',
    }));
    expect(result).toMatchObject({ url: expect.stringContaining('cloudinary'), publicId: 'pid' });
  });

  it('field no existe → DomainError FIELD_NOT_FOUND', async () => {
    const deps = makeDeps();
    await expect(makeUploadDynamicAsset(deps)({ resource, fieldName: 'nope', buffer, mimeType: 'image/png' }))
      .rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' });
    expect(deps.store.uploadBuffer).not.toHaveBeenCalled();
  });

  it('field de tipo != asset → DomainError FIELD_NOT_ASSET', async () => {
    const deps = makeDeps();
    await expect(makeUploadDynamicAsset(deps)({ resource, fieldName: 'title', buffer, mimeType: 'image/png' }))
      .rejects.toMatchObject({ code: 'FIELD_NOT_ASSET' });
  });

  it('mime no permitido → DomainError INVALID_MIME', async () => {
    const deps = makeDeps();
    await expect(makeUploadDynamicAsset(deps)({ resource, fieldName: 'hero', buffer, mimeType: 'application/x-shockwave-flash' }))
      .rejects.toMatchObject({ code: 'INVALID_MIME' });
  });

  it('tamaño > 10MB → DomainError FILE_TOO_LARGE', async () => {
    const deps = makeDeps();
    const oversize = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    await expect(makeUploadDynamicAsset(deps)({ resource, fieldName: 'hero', buffer: oversize, mimeType: 'image/png' }))
      .rejects.toBeInstanceOf(DomainError);
  });

  it('acepta application/pdf y video/mp4 por default', async () => {
    const deps = makeDeps();
    await makeUploadDynamicAsset(deps)({ resource, fieldName: 'doc', buffer, mimeType: 'application/pdf' });
    await makeUploadDynamicAsset(deps)({ resource, fieldName: 'doc', buffer, mimeType: 'video/mp4' });
    expect(deps.store.uploadBuffer).toHaveBeenCalledTimes(2);
  });

  it('buffer vacío o inválido → DomainError EMPTY_FILE', async () => {
    const deps = makeDeps();
    await expect(makeUploadDynamicAsset(deps)({ resource, fieldName: 'hero', buffer: Buffer.alloc(0), mimeType: 'image/png' }))
      .rejects.toMatchObject({ code: 'EMPTY_FILE' });
  });
});
