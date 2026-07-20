/**
 * Pruebas unitarias del caso de uso deleteAsset (hard-block + destroy + soft-delete).
 * Cubre: happy path, asset referenciado → 422, asset inexistente → 404,
 * destroy CDN falla → propaga, soft-delete local falla → no relanza.
 *
 * @module ManageTenantGalleryDeleteAssetUnitTest
 */
import { describe, it, expect, vi } from 'vitest';
import { makeDeleteAsset } from '../application/delete-asset.usecase.js';

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const asset = {
  id: 'a1', provider: 'cloudinary', publicId: 'products/photo/abc',
  url: 'https://res.cloudinary.com/x/products/photo/abc.jpg',
};

describe('delete-asset — hard-block + destroy + soft-delete', () => {
  /**
   * Construye dependencias mock para el caso de uso deleteAsset.
   * @param {Object} [opts]
   * @param {Array} [opts.references=[]] - Referencias activas al asset.
   * @param {Function} [opts.destroyImpl] - Implementación mock de destroy CDN.
   * @returns {{ uc: Function, assetRepository: Object, findAssetReferences: Function, resolveAssetStore: Function, destroyImpl: Function }}
   */
  function build({ references = [], destroyImpl = vi.fn(async () => ({ result: 'ok' })) } = {}) {
    const assetRepository = {
      findActiveById: vi.fn(() => asset),
      softDelete: vi.fn(),
    };
    const findAssetReferences = vi.fn(async () => references);
    const resolveAssetStore = vi.fn(async () => ({ destroy: destroyImpl }));
    return {
      uc: makeDeleteAsset({ assetRepository, findAssetReferences, resolveAssetStore, logger: silent, now: () => 999 }),
      assetRepository, findAssetReferences, resolveAssetStore, destroyImpl,
    };
  }

  it('happy path (sin referencias) → destroy CDN + soft-delete local + { deleted: true }', async () => {
    const { uc, assetRepository, destroyImpl } = build();
    const res = await uc({ id: 'a1' });

    expect(destroyImpl).toHaveBeenCalledWith(asset.publicId);
    expect(assetRepository.softDelete).toHaveBeenCalledWith({ id: 'a1', now: 999 });
    expect(res).toEqual({ id: 'a1', deleted: true });
  });

  it('referenciado por 2 filas → 422 ASSET_IN_USE + details.references (sin destroy ni soft-delete)', async () => {
    const references = [
      { resource: 'products', field: 'photo', rowId: 'p-1' },
      { resource: 'events', field: 'cover', rowId: 'e-9' },
    ];
    const { uc, assetRepository, destroyImpl } = build({ references });

    await expect(uc({ id: 'a1' })).rejects.toMatchObject({
      code: 'ASSET_IN_USE',
      statusCode: 422,
      details: { references },
    });
    expect(destroyImpl).not.toHaveBeenCalled();
    expect(assetRepository.softDelete).not.toHaveBeenCalled();
  });

  it('asset inexistente → 404 ASSET_NOT_FOUND', async () => {
    const { uc, assetRepository } = build();
    assetRepository.findActiveById = vi.fn(() => null);
    // Re-crear el use case con el override.
    const uc2 = makeDeleteAsset({
      assetRepository,
      findAssetReferences: async () => [],
      resolveAssetStore: async () => ({ destroy: async () => {} }),
      logger: silent,
    });
    await expect(uc2({ id: 'no-existe' })).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('destroy CDN falla → excepción propaga, catálogo local NO se toca', async () => {
    const cdnErr = new Error('cloudinary down');
    const { uc, assetRepository } = build({
      destroyImpl: vi.fn(async () => { throw cdnErr; }),
    });
    await expect(uc({ id: 'a1' })).rejects.toThrow('cloudinary down');
    expect(assetRepository.softDelete).not.toHaveBeenCalled();
  });

  it('soft-delete local falla tras destroy OK → no relanza (log + continúa)', async () => {
    const { uc, assetRepository, destroyImpl } = build();
    assetRepository.softDelete = vi.fn(() => { throw new Error('sqlite locked'); });

    const res = await uc({ id: 'a1' });
    expect(destroyImpl).toHaveBeenCalled();
    expect(res).toEqual({ id: 'a1', deleted: true });
  });
});
