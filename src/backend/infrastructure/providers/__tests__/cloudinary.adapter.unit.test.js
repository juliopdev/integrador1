import { describe, it, expect, vi } from 'vitest';
import { parseCloudinaryUri, createCloudinaryStore } from '../cloudinary.adapter.js';

describe('parseCloudinaryUri', () => {
  it('parsea URI válida en { cloudName, apiKey, apiSecret }', () => {
    expect(parseCloudinaryUri('cloudinary://123456789:abcSecretXYZ@duexchlzl')).toEqual({
      cloudName: 'duexchlzl', apiKey: '123456789', apiSecret: 'abcSecretXYZ',
    });
  });

  it('rechaza URI sin scheme', () => {
    expect(() => parseCloudinaryUri('123:abc@duexchlzl')).toThrow(/formato/i);
  });

  it('rechaza URI sin secret o sin cloud_name', () => {
    expect(() => parseCloudinaryUri('cloudinary://123@duexchlzl')).toThrow();
    expect(() => parseCloudinaryUri('cloudinary://123:abc@')).toThrow();
  });
});

describe('createCloudinaryStore — uploadBuffer + destroy (adapter mockeado)', () => {
  const URI = 'cloudinary://123:sec@testcloud';

  it('uploadBuffer llama a uploader.upload_stream con el folder correcto y devuelve el shape esperado', async () => {
    // Mock del stream: capturamos el callback y lo invocamos con el resultado.
    const uploadStub = vi.fn((options, callback) => {
      // Devuelve un writable stream fake.
      return {
        end: (buffer) => {
          callback(null, {
            public_id: 'test/folder/abc123',
            secure_url: 'https://res.cloudinary.com/testcloud/image/upload/test/folder/abc123.png',
            format: 'png', bytes: buffer.length, width: 1, height: 1,
          });
        },
      };
    });
    const destroyStub = vi.fn(async () => ({ result: 'ok' }));

    const store = createCloudinaryStore(URI, {
      sdk: { uploader: { upload_stream: uploadStub, destroy: destroyStub }, config: vi.fn() },
    });

    const buffer = Buffer.from('fake-png-bytes');
    const result = await store.uploadBuffer({ buffer, folder: 'tenant-t1/products_db/hero' });

    expect(uploadStub).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'tenant-t1/products_db/hero', resource_type: 'auto' }),
      expect.any(Function),
    );
    expect(result).toEqual({
      publicId: 'test/folder/abc123',
      url: 'https://res.cloudinary.com/testcloud/image/upload/test/folder/abc123.png',
      format: 'png', bytes: buffer.length, width: 1, height: 1,
    });
  });

  it('propaga error si el upload falla', async () => {
    const uploadStub = vi.fn((_options, callback) => ({
      end: () => callback(new Error('cloudinary down'), null),
    }));
    const store = createCloudinaryStore(URI, {
      sdk: { uploader: { upload_stream: uploadStub, destroy: vi.fn() }, config: vi.fn() },
    });
    await expect(store.uploadBuffer({ buffer: Buffer.from('x'), folder: 'f' }))
      .rejects.toThrow(/cloudinary down/);
  });

  it('destroy delega a uploader.destroy', async () => {
    const destroyStub = vi.fn(async () => ({ result: 'ok' }));
    const store = createCloudinaryStore(URI, {
      sdk: { uploader: { upload_stream: vi.fn(), destroy: destroyStub }, config: vi.fn() },
    });
    const res = await store.destroy('test/folder/abc123');
    expect(destroyStub).toHaveBeenCalledWith('test/folder/abc123');
    expect(res).toEqual({ result: 'ok' });
  });
});
