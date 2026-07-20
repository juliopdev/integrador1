import { describe, it, expect, vi } from 'vitest';
import { makeInsertDynamicRecord } from '../application/insert-dynamic-record.usecase.js';
import { compileResourceSchema } from '../../../infrastructure/no-code/dynamic-validator.builder.js';
import { DomainError } from '../../../common/errors.js';

const resource = {
  name: 'products',
  physicalName: 'products_db',
  store: 'sql',
  fields: [
    { id: 'f1', name: 'title', type: 'string', required: true },
    { id: 'f2', name: 'price', type: 'float' },
  ],
};

function makeDeps({ insertRes = { id: 'r1', title: 'x', price: 100 } } = {}) {
  const store = { insert: vi.fn(async () => insertRes) };
  const resolveStore = vi.fn(async () => store);
  return { store, resolveStore, usecase: makeInsertDynamicRecord({ resolveStore, tenantId: 't1', tenantDb: {}, compileResourceSchema }) };
}

describe('insert-dynamic-record.usecase — validación dinámica + inserción', () => {
  it('body válido → resuelve store, inserta con auditoría y devuelve la fila', async () => {
    const { resolveStore, store, usecase } = makeDeps();
    const result = await usecase({ resource, body: { title: 'Camisa', price: 100 } });
    expect(resolveStore).toHaveBeenCalledWith({ tenantId: 't1', tenantDb: {}, storeType: 'sql' });
    // El use case inyecta id UUIDv7 + created_at/updated_at antes de delegar al store — así todos
    // los adapters (Neon, Mongo, futuros) reciben una fila autosuficiente.
    expect(store.insert).toHaveBeenCalledWith(
      'products_db',
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/),
        title: 'Camisa',
        price: 100,
        created_at: expect.any(Number),
        updated_at: expect.any(Number),
      }),
    );
    expect(result).toEqual({ id: 'r1', title: 'x', price: 100 });
  });

  it('coerce: acepta price como string desde Form SSR', async () => {
    const { store, usecase } = makeDeps();
    await usecase({ resource, body: { title: 'Camisa', price: '99.5' } });
    // Después del coerce, el store recibe el número real (junto con la auditoría inyectada).
    expect(store.insert).toHaveBeenCalledWith(
      'products_db',
      expect.objectContaining({ title: 'Camisa', price: 99.5 }),
    );
  });

  it('body inválido (falta requerido) → DomainError VALIDATION_ERROR sin tocar el store', async () => {
    const { store, usecase } = makeDeps();
    await expect(usecase({ resource, body: { price: 10 } })).rejects.toBeInstanceOf(DomainError);
    await expect(usecase({ resource, body: { price: 10 } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('claves desconocidas (inyección) → rechaza sin llegar al store (`strict`)', async () => {
    const { store, usecase } = makeDeps();
    await expect(usecase({ resource, body: { title: 'x', created_at: 999 } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(store.insert).not.toHaveBeenCalled();
  });
});
