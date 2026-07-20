import { describe, it, expect, vi } from 'vitest';
import { makeListAssets } from '../application/list-assets.usecase.js';

/**
 * P8.2: listado paginado + filtros del catálogo local `assets`. El use case delega el paginado a
 * `common/pagination.js` (primer uso real — canary de P8.1.1) y normaliza los filtros contra el
 * enum permitido antes de pasar al repositorio.
 */
describe('list-assets — paginación + filtros', () => {
  const rows = [{ id: 'a1' }, { id: 'a2' }];

  function makeDeps({ total = 2 } = {}) {
    return {
      assetRepository: {
        listActive: vi.fn(() => rows),
        countActive: vi.fn(() => total),
      },
    };
  }

  it('sin query → defaults (page=1, limit=20, sin filtros)', async () => {
    const deps = makeDeps();
    const uc = makeListAssets(deps);
    const res = await uc({ query: {} });

    expect(res.data).toEqual(rows);
    expect(res.meta).toEqual({
      page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false,
    });
    expect(deps.assetRepository.listActive).toHaveBeenCalledWith({
      limit: 20, offset: 0, provider: null, mimeFamilies: null,
    });
  });

  it('query con page/limit → parsePagination los aplica y ajusta offset', async () => {
    const deps = makeDeps({ total: 150 });
    const uc = makeListAssets(deps);
    const res = await uc({ query: { page: '3', limit: '25' } });

    expect(res.meta).toMatchObject({ page: 3, limit: 25, total: 150, totalPages: 6, hasPrev: true, hasNext: true });
    expect(deps.assetRepository.listActive).toHaveBeenCalledWith({
      limit: 25, offset: 50, provider: null, mimeFamilies: null,
    });
  });

  it('provider=cloudinary → se pasa al repo', async () => {
    const deps = makeDeps();
    const uc = makeListAssets(deps);
    await uc({ query: { provider: 'cloudinary' } });
    expect(deps.assetRepository.listActive).toHaveBeenCalledWith(expect.objectContaining({ provider: 'cloudinary' }));
    expect(deps.assetRepository.countActive).toHaveBeenCalledWith({ provider: 'cloudinary', mimeFamilies: null });
  });

  it('provider inválido → se ignora (null)', async () => {
    const deps = makeDeps();
    const uc = makeListAssets(deps);
    await uc({ query: { provider: 'aws-s3' } });
    expect(deps.assetRepository.listActive).toHaveBeenCalledWith(expect.objectContaining({ provider: null }));
  });

  it('type=image (string) → mimeFamilies=[image]', async () => {
    const deps = makeDeps();
    const uc = makeListAssets(deps);
    await uc({ query: { type: 'image' } });
    expect(deps.assetRepository.listActive).toHaveBeenCalledWith(expect.objectContaining({ mimeFamilies: ['image'] }));
  });

  it('type array con inválidos → los filtra y deja los válidos', async () => {
    const deps = makeDeps();
    const uc = makeListAssets(deps);
    await uc({ query: { type: ['image', 'exe', 'document'] } });
    expect(deps.assetRepository.listActive).toHaveBeenCalledWith(expect.objectContaining({ mimeFamilies: ['image', 'document'] }));
  });

  it('type=[] (todos inválidos) → mimeFamilies=null (sin filtro de tipo)', async () => {
    const deps = makeDeps();
    const uc = makeListAssets(deps);
    await uc({ query: { type: ['exe', 'unknown'] } });
    expect(deps.assetRepository.listActive).toHaveBeenCalledWith(expect.objectContaining({ mimeFamilies: null }));
  });
});
