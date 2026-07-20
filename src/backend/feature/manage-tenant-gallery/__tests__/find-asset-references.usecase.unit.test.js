import { describe, it, expect, vi } from 'vitest';
import { makeFindAssetReferences } from '../application/find-asset-references.usecase.js';

const silent = { info: () => {}, warn: () => {}, error: () => {} };

describe('find-asset-references — cross-store referencias por url', () => {
  const url = 'https://res.cloudinary.com/x/products/photo/abc.jpg';

  function build({ schema = null, storeByStore = {} } = {}) {
    return makeFindAssetReferences({
      contractRepository: { getActiveContract: () => schema ? { schema } : null },
      resolveStore: async ({ storeType }) => storeByStore[storeType] || { findByFieldValue: async () => [] },
      tenantId: 't1',
      tenantDb: {},
      logger: silent,
    });
  }

  it('sin contrato activo → []', async () => {
    const uc = build();
    expect(await uc({ url })).toEqual([]);
  });

  it('sin resources con field type=asset → []', async () => {
    const uc = build({ schema: { resources: [{ name: 'orders', store: 'sql', fields: [{ name: 'total', type: 'integer' }] }] } });
    expect(await uc({ url })).toEqual([]);
  });

  it('resource con field asset y filas que coinciden → agrega refs', async () => {
    const uc = build({
      schema: {
        resources: [
          {
            name: 'products', physicalName: 'products_db', store: 'sql',
            fields: [{ name: 'photo', type: 'asset' }],
          },
        ],
      },
      storeByStore: {
        sql: { findByFieldValue: async () => [{ id: 'row-1' }, { id: 'row-2' }] },
      },
    });
    const refs = await uc({ url });
    expect(refs).toEqual([
      { resource: 'products', field: 'photo', rowId: 'row-1' },
      { resource: 'products', field: 'photo', rowId: 'row-2' },
    ]);
  });

  it('store no resuelve → fail-CLOSED: agrega ref genérica + log warn', async () => {
    const uc = makeFindAssetReferences({
      contractRepository: { getActiveContract: () => ({
        schema: {
          resources: [{ name: 'products', physicalName: 'p_db', store: 'sql',
            fields: [{ name: 'photo', type: 'asset' }] }],
        },
      }) },
      resolveStore: async () => { throw new Error('STORE_NOT_CONFIGURED'); },
      tenantId: 't1', tenantDb: {}, logger: silent,
    });
    const refs = await uc({ url });
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]).toMatchObject({ resource: 'products' });
  });
});
