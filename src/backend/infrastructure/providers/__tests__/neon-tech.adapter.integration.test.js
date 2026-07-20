import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNeonStore } from '../neon-tech.adapter.js';

// Integración contra Neon REAL (URI de test del .env). Se omite si no hay URI configurada.
const URI = process.env.TEST_URI_CONECTION_NEONTECH;
const suite = URI ? describe : describe.skip;
const TABLE = `baas_test_products_${Date.now()}`; // único por corrida (se elimina al final)

let store;

beforeAll(async () => {
  store = createNeonStore(URI);
  await store.ensureResource({
    physicalName: TABLE,
    fields: [
      { id: 'f1', name: 'title', type: 'string', required: true },
      { id: 'f2', name: 'price', type: 'integer' },
    ],
  });
});

afterAll(async () => {
  if (!store) return;
  try {
    await store.query(`DROP TABLE IF EXISTS "${TABLE}"`);
  } catch {
    /* best-effort cleanup */
  }
  await store.close();
});

suite('neon store (integración · Neon real)', () => {
  it('crea la tabla con sus columnas + campos de auditoría', async () => {
    const { rows } = await store.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1',
      [TABLE],
    );
    const cols = Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
    expect(cols).toMatchObject({ id: 'text', title: 'character varying', price: 'bigint', created_at: 'bigint', deleted_at: 'bigint' });
  });

  it('CRUD: insert → findById/findMany → update → softDelete', async () => {
    const now = Date.now();
    const inserted = await store.insert(TABLE, { id: 'r1', title: 'Camisa', price: 100, created_at: now, updated_at: now });
    expect(inserted).toMatchObject({ id: 'r1', title: 'Camisa', price: '100' }); // bigint → string en pg

    expect(await store.findById(TABLE, 'r1')).toMatchObject({ title: 'Camisa' });
    expect(await store.findMany(TABLE)).toHaveLength(1);

    const updated = await store.update(TABLE, 'r1', { title: 'Camisa azul', updated_at: Date.now() });
    expect(updated.title).toBe('Camisa azul');

    expect(await store.softDelete(TABLE, 'r1', Date.now())).toBe(true);
    expect(await store.findById(TABLE, 'r1')).toBeNull(); // ya no se sirve
    expect(await store.findMany(TABLE)).toHaveLength(0);
  });
});
