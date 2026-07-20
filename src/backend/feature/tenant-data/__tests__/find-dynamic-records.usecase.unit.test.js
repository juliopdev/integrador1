import { describe, it, expect, vi } from 'vitest';
import { makeFindDynamicRecords } from '../application/find-dynamic-records.usecase.js';
import { AppError } from '../../../common/errors.js';

function fakeStore(rows) {
  return { findMany: vi.fn(async (physicalName, opts) => rows) };
}

describe('find-dynamic-records.usecase — lectura paginada de records dinámicos', () => {
  it('resuelve el store del tenant y llama `findMany(physicalName, { limit, offset })`', async () => {
    const store = fakeStore([{ id: 'r1', title: 'x' }]);
    const resolveStore = vi.fn(async () => store);
    const usecase = makeFindDynamicRecords({ resolveStore, tenantId: 't1', tenantDb: {} });

    const result = await usecase({
      resource: { name: 'products', physicalName: 'products_db', store: 'sql' },
      limit: 25, offset: 50,
    });

    expect(resolveStore).toHaveBeenCalledWith({ tenantId: 't1', tenantDb: {}, storeType: 'sql' });
    expect(store.findMany).toHaveBeenCalledWith('products_db', { limit: 25, offset: 50 });
    expect(result).toEqual({
      records: [{ id: 'r1', title: 'x' }],
      pagination: { limit: 25, offset: 50, count: 1 },
    });
  });

  it('aplica defaults de paginación cuando no vienen (limit=20, offset=0)', async () => {
    const store = fakeStore([]);
    const resolveStore = vi.fn(async () => store);
    const usecase = makeFindDynamicRecords({ resolveStore, tenantId: 't1', tenantDb: {} });
    await usecase({ resource: { physicalName: 'x_db', store: 'sql' } });
    expect(store.findMany).toHaveBeenCalledWith('x_db', { limit: 20, offset: 0 });
  });

  it('propaga `STORE_NOT_CONFIGURED` del resolveStore (el handler lo maneja como estado sin-datos)', async () => {
    const err = new AppError(503, 'STORE_NOT_CONFIGURED', 'no provider');
    const resolveStore = vi.fn(async () => { throw err; });
    const usecase = makeFindDynamicRecords({ resolveStore, tenantId: 't1', tenantDb: {} });
    await expect(usecase({ resource: { physicalName: 'x_db', store: 'sql' } })).rejects.toBe(err);
  });
});
