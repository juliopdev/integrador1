import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNeonStore } from '../neon-tech.adapter.js';
import { diffResources } from '../../no-code/contract-diff.js';

const URI = process.env.TEST_URI_CONECTION_NEONTECH;
const suite = URI ? describe : describe.skip;
const TABLE = `baas_test_migrate_${Date.now()}`;

const oldResource = { physicalName: TABLE, fields: [{ id: 'f1', name: 'title', type: 'string', required: true }, { id: 'f2', name: 'price', type: 'integer' }] };
const newResource = { physicalName: TABLE, fields: [{ id: 'f1', name: 'name', type: 'string' }, { id: 'f2', name: 'price', type: 'float' }, { id: 'f3', name: 'active', type: 'boolean' }] };

let store;

beforeAll(async () => {
  store = createNeonStore(URI);
  await store.ensureResource(oldResource);
  const now = Date.now();
  await store.insert(TABLE, { id: 'm1', title: 'original', price: 50, created_at: now, updated_at: now });
});

afterAll(async () => {
  if (!store) return;
  try { await store.query(`DROP TABLE IF EXISTS "${TABLE}"`); } catch { /* */ }
  await store.close();
});

suite('migración por field.id (integración · Neon real)', () => {
  it('rename + add + retype preservan los datos existentes', async () => {
    await store.migrate(TABLE, diffResources(oldResource, newResource));

    // la columna se renombró (title→name) y el dato sobrevive; price pasó a float; active es nueva
    const { rows } = await store.query(`SELECT * FROM "${TABLE}" WHERE id = $1`, ['m1']);
    expect(rows[0].name).toBe('original'); // dato preservado bajo el nombre nuevo
    expect(rows[0]).not.toHaveProperty('title');
    expect(Number(rows[0].price)).toBe(50);
    expect(rows[0].active).toBeNull();

    // tipo de price ahora es double precision
    const { rows: cols } = await store.query('SELECT data_type FROM information_schema.columns WHERE table_name=$1 AND column_name=$2', [TABLE, 'price']);
    expect(cols[0].data_type).toBe('double precision');
  });
});
