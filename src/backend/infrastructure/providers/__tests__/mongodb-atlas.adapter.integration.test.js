import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient } from 'mongodb';
import { createMongoStore } from '../mongodb-atlas.adapter.js';

// Integración contra Mongo Atlas REAL (URI de test del .env). Se omite si no hay URI configurada.
// Antes de 2026-07-02 este test corría con `mongodb-memory-server` porque el driver 6 no podía
// abrir conexiones SSL/SRV en el entorno de tests; la limitación ya se resolvió y usamos Atlas
// real (misma disciplina que Neon).
const URI = process.env.TEST_URI_CONECTION_MONGODBATLAS;
const suite = URI && !URI.includes('...mongodb.net') ? describe : describe.skip;
const TABLE = `baas_test_products_${Date.now()}`;

const resource = {
  physicalName: TABLE,
  fields: [
    { id: 'f1', name: 'title', type: 'string', required: true },
    { id: 'f2', name: 'price', type: 'integer' },
  ],
};

let store;

beforeAll(async () => {
  store = createMongoStore(URI);
  await store.ensureResource(resource);
}, 30000);

afterAll(async () => {
  if (!store) return;
  // Best-effort cleanup: dropea la colección del test para dejar el clúster limpio.
  try {
    const client = new MongoClient(URI);
    await client.connect();
    await client.db().collection(TABLE).drop().catch(() => {});
    await client.close();
  } catch { /* silencioso: cleanup */ }
  await store.close();
});

suite('mongo store (integración · Mongo Atlas real)', () => {
  it('CRUD: insert → findById/findMany → update → softDelete', async () => {
    const now = Date.now();
    const inserted = await store.insert(TABLE, { id: 'r1', title: 'Camisa', price: 100, created_at: now, updated_at: now });
    expect(inserted).toMatchObject({ id: 'r1', title: 'Camisa' });

    expect((await store.findById(TABLE, 'r1')).title).toBe('Camisa');
    expect(await store.findMany(TABLE)).toHaveLength(1);

    const updated = await store.update(TABLE, 'r1', { title: 'Camisa azul', updated_at: Date.now() });
    expect(updated.title).toBe('Camisa azul');

    expect(await store.softDelete(TABLE, 'r1', Date.now())).toBe(true);
    expect(await store.findById(TABLE, 'r1')).toBeNull();
    expect(await store.findMany(TABLE)).toHaveLength(0);
  });

  it('migrate aplica renombres ($rename) preservando datos (schemaless)', async () => {
    const now = Date.now();
    await store.insert(TABLE, { id: 'r2', title: 'Pantalón', price: 50, created_at: now, updated_at: now });

    await store.migrate(TABLE, { adds: [], renames: [{ from: 'title', to: 'name' }], retypes: [], drops: [] });

    const doc = await store.findById(TABLE, 'r2');
    expect(doc.name).toBe('Pantalón');
    expect(doc.title).toBeUndefined();
  });
});
