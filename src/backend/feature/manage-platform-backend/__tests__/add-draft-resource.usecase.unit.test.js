import { describe, it, expect, vi } from 'vitest';
import { makeAddDraftResource } from '../application/add-draft-resource.usecase.js';
import { DomainError } from '../../../common/errors.js';

function fakeRepo({ draft = null, published = null } = {}) {
  return {
    getDraft: vi.fn(() => draft),
    getActiveContract: vi.fn(() => published),
    saveDraft: vi.fn(),
  };
}

describe('add-draft-resource.usecase — agrega un resource al draft del asistente', () => {
  const input = { name: 'products', physicalName: 'products_db', store: 'sql' };

  it('sin draft ni publicado previo → crea draft en v1 con el resource (sin fields)', async () => {
    const repo = fakeRepo();
    const usecase = makeAddDraftResource({ contractRepository: repo });
    await usecase(input);

    expect(repo.saveDraft).toHaveBeenCalledTimes(1);
    const args = repo.saveDraft.mock.calls[0][0];
    expect(args.version).toBe('v1');
    const parsed = JSON.parse(args.schemaJson);
    expect(parsed.version).toBe('v1');
    expect(parsed.resources).toEqual([{ name: 'products', physicalName: 'products_db', store: 'sql', fields: [], manageable: true }]);
    // Defaults del contrato (stores + endpoints + auth) también presentes para que sea publicable en el futuro.
    expect(parsed.stores).toBeDefined();
    expect(parsed.endpoints).toEqual([
      {
        path: '/products',
        resource: 'products',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        access: {
          GET: ['master', 'user'],
          POST: ['master'],
          PUT: ['master'],
          DELETE: ['master']
        }
      }
    ]);
    expect(parsed.auth).toEqual({ userAuthEnabled: false, strategies: [], redirectUris: [] });
  });

  it('con publicado v1 → sugiere v2 como versión del draft', async () => {
    const repo = fakeRepo({ published: { version: 'v1', status: 'published', schema: { resources: [] } } });
    const usecase = makeAddDraftResource({ contractRepository: repo });
    await usecase(input);
    expect(repo.saveDraft.mock.calls[0][0].version).toBe('v2');
  });

  it('con draft ya existente → merge del resource en la lista actual', async () => {
    const existingDraft = {
      version: 'v2', status: 'draft',
      schema: {
        version: 'v2',
        stores: { sql: { provider: 'neon', enabled: true } },
        resources: [{ name: 'orders', physicalName: 'orders_db', store: 'sql', fields: [] }],
        endpoints: [],
        auth: { userAuthEnabled: false, strategies: [], redirectUris: [] },
      },
    };
    const repo = fakeRepo({ draft: existingDraft });
    const usecase = makeAddDraftResource({ contractRepository: repo });
    await usecase(input);
    const parsed = JSON.parse(repo.saveDraft.mock.calls[0][0].schemaJson);
    expect(parsed.resources.map((r) => r.name)).toEqual(['orders', 'products']);
  });

  it('nombre duplicado (ya en draft) → DomainError DUPLICATE_RESOURCE', async () => {
    const draft = {
      version: 'v1', status: 'draft',
      schema: { version: 'v1', resources: [{ name: 'products', physicalName: 'x', store: 'sql', fields: [] }], stores: {}, endpoints: [], auth: {} },
    };
    const repo = fakeRepo({ draft });
    const usecase = makeAddDraftResource({ contractRepository: repo });
    await expect(usecase(input)).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });
    expect(repo.saveDraft).not.toHaveBeenCalled();
  });

  it('name no snake_case → DomainError INVALID_NAME', async () => {
    const repo = fakeRepo();
    const usecase = makeAddDraftResource({ contractRepository: repo });
    await expect(usecase({ ...input, name: 'MyProduct' })).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(usecase({ ...input, name: '1products' })).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(usecase({ ...input, physicalName: 'MyProducts' })).rejects.toMatchObject({ code: 'INVALID_NAME' });
    expect(repo.saveDraft).not.toHaveBeenCalled();
  });

  it('store fuera de enum (sql|nosql) → DomainError INVALID_STORE', async () => {
    const repo = fakeRepo();
    const usecase = makeAddDraftResource({ contractRepository: repo });
    await expect(usecase({ ...input, store: 'graph' })).rejects.toMatchObject({ code: 'INVALID_STORE' });
    await expect(usecase({ ...input, store: 'SQL' })).rejects.toMatchObject({ code: 'INVALID_STORE' });
    expect(repo.saveDraft).not.toHaveBeenCalled();
  });

  it('devuelve el resumen del draft actualizado (version + resource names) para el UI', async () => {
    const repo = fakeRepo();
    const usecase = makeAddDraftResource({ contractRepository: repo });
    const result = await usecase(input);
    expect(result).toEqual({ version: 'v1', resources: ['products'] });
  });
});
