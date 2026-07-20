import { describe, it, expect, vi } from 'vitest';
import { makeGetRecord } from '../application/get-record.usecase.js';
import { makeUpdateDynamicRecord } from '../application/update-dynamic-record.usecase.js';
import { makeDeleteDynamicRecord } from '../application/delete-dynamic-record.usecase.js';
import { compileResourceSchema } from '../../../infrastructure/no-code/dynamic-validator.builder.js';
import { DomainError, NotFoundError } from '../../../common/errors.js';

const resource = {
  name: 'products',
  physicalName: 'products_db',
  store: 'sql',
  fields: [
    { id: 'f1', name: 'title', type: 'string', required: true },
    { id: 'f2', name: 'price', type: 'float' },
  ],
};

function makeDeps(overrides = {}) {
  const store = {
    findById: vi.fn(async () => ({ id: 'r1', title: 'Camisa', price: 100 })),
    update: vi.fn(async () => ({ id: 'r1', title: 'Camisa v2', price: 120 })),
    softDelete: vi.fn(async () => true),
    ...overrides,
  };
  const resolveStore = vi.fn(async () => store);
  return { store, resolveStore, deps: { resolveStore, tenantId: 't1', tenantDb: {}, compileResourceSchema } };
}

describe('get-record.usecase', () => {
  it('resuelve store y delega en findById', async () => {
    const { store, deps } = makeDeps();
    const result = await makeGetRecord(deps)({ resource, id: 'r1' });
    expect(store.findById).toHaveBeenCalledWith('products_db', 'r1');
    expect(result).toEqual({ id: 'r1', title: 'Camisa', price: 100 });
  });

  it('devuelve null si no existe (no lanza)', async () => {
    const { deps } = makeDeps({ findById: async () => null });
    const result = await makeGetRecord(deps)({ resource, id: 'nope' });
    expect(result).toBeNull();
  });
});

describe('update-dynamic-record.usecase', () => {
  it('body válido (partial) → actualiza inyectando updated_at y devuelve la fila', async () => {
    const { store, deps } = makeDeps();
    const result = await makeUpdateDynamicRecord(deps)({ resource, id: 'r1', body: { price: 120 } });
    // El use case inyecta `updated_at` en cada patch — el store no toca la auditoría.
    expect(store.update).toHaveBeenCalledWith(
      'products_db',
      'r1',
      expect.objectContaining({ price: 120, updated_at: expect.any(Number) }),
    );
    expect(result).toEqual({ id: 'r1', title: 'Camisa v2', price: 120 });
  });

  it('coerce: acepta price como string (Form SSR)', async () => {
    const { store, deps } = makeDeps();
    await makeUpdateDynamicRecord(deps)({ resource, id: 'r1', body: { price: '150.5' } });
    expect(store.update).toHaveBeenCalledWith(
      'products_db',
      'r1',
      expect.objectContaining({ price: 150.5, updated_at: expect.any(Number) }),
    );
  });

  it('body sin cambios en partial → refresca sólo updated_at', async () => {
    const { store, deps } = makeDeps();
    await makeUpdateDynamicRecord(deps)({ resource, id: 'r1', body: {} });
    // Un PUT sin cambios sigue tocando `updated_at` — semántica de "actualización tocada".
    expect(store.update).toHaveBeenCalledWith(
      'products_db',
      'r1',
      expect.objectContaining({ updated_at: expect.any(Number) }),
    );
  });

  it('body con claves inyectadas → DomainError sin tocar el store', async () => {
    const { store, deps } = makeDeps();
    await expect(makeUpdateDynamicRecord(deps)({ resource, id: 'r1', body: { deleted_at: 0 } }))
      .rejects.toBeInstanceOf(DomainError);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('record inexistente (store.update devuelve null) → NotFoundError', async () => {
    const { deps } = makeDeps({ update: async () => null });
    await expect(makeUpdateDynamicRecord(deps)({ resource, id: 'nope', body: { price: 1 } }))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('delete-dynamic-record.usecase', () => {
  it('soft-delete OK → devuelve { id, deleted: true }', async () => {
    const { store, deps } = makeDeps();
    const res = await makeDeleteDynamicRecord(deps)({ resource, id: 'r1' });
    expect(store.softDelete).toHaveBeenCalledWith('products_db', 'r1', expect.any(Number));
    expect(res).toEqual({ id: 'r1', deleted: true });
  });

  it('record inexistente (softDelete devuelve false) → NotFoundError', async () => {
    const { deps } = makeDeps({ softDelete: async () => false });
    await expect(makeDeleteDynamicRecord(deps)({ resource, id: 'nope' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});
