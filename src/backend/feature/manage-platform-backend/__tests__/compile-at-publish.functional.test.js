import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers, tenants } from '../../../config/drizzle/schema-platform.js';
import { hashSecret } from '../../../common/password.js';
import { createNeonStore } from '../../../infrastructure/providers/neon-tech.adapter.js';
import { closeAllStores } from '../../../infrastructure/no-code/store-resolver.js';
import { buildApp } from '../../../kernel/app.js';

const URI = process.env.TEST_URI_CONECTION_NEONTECH;
const suite = URI ? describe : describe.skip;
const PHYS = `baas_test_evolve_${Date.now()}`;
const PW = 'Password123';
const PP = 'frase de paso larga';

const contract = (fields) => ({
  version: 'v1',
  stores: { sql: { provider: 'neon', enabled: true } },
  resources: [{ name: 'products', store: 'sql', physicalName: PHYS, fields }],
  endpoints: [{ path: '/products', resource: 'products', methods: ['GET', 'POST'] }],
  auth: { userAuthEnabled: false },
});

suite('compile-at-publish: re-publicar evoluciona las tablas (funcional · Neon real)', () => {
  let app;
  let tmp;
  let originalDir;
  let superToken;
  let createdId;

  beforeAll(async () => {
    migratePlatform();
    originalDir = env.TENANTS_DB_DIR;
    tmp = mkdtempSync(join(tmpdir(), 'baas-evolve-'));
    env.TENANTS_DB_DIR = tmp;

    const now = Date.now();
    platformDb.insert(platformUsers).values({ id: 'sa', email: 'super@baas.com', passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP), createdAt: now, updatedAt: now }).run();
    platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
    migrateTenant('t1');

    app = await buildApp();
    superToken = (await app.inject({ method: 'POST', url: '/api-system/v1/login', payload: { email: 'super@baas.com', password: PW, passphrase: PP } })).json().data.accessToken;

    const sa = (url, body) => app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${superToken}` }, payload: body });
    await sa('/api-system/v1/tenants/t1/providers', { category: 'database', provider: 'neon', config: { uri: URI } });
    await sa('/api-system/v1/tenants/t1/backend', contract([{ id: 'f1', name: 'title', type: 'string', required: true }]));

    const create = await app.inject({ method: 'POST', url: '/api/v1/products', headers: { host: 'tienda.localhost' }, payload: { title: 'Camisa' } });
    createdId = create.json().data.id;
  });

  afterAll(async () => {
    await app?.close();
    await closeAllStores();
    const cleanup = createNeonStore(URI);
    try { await cleanup.query(`DROP TABLE IF EXISTS "${PHYS}"`); } catch { /* */ }
    await cleanup.close();
    env.TENANTS_DB_DIR = originalDir;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('re-publicar con un campo renombrado (+ uno nuevo) migra preservando el dato', async () => {
    // v1' : f1 renombrado title→name, + f2 'price' nuevo
    const rep = await app.inject({
      method: 'POST',
      url: '/api-system/v1/tenants/t1/backend',
      headers: { authorization: `Bearer ${superToken}` },
      payload: contract([{ id: 'f1', name: 'name', type: 'string', required: true }, { id: 'f2', name: 'price', type: 'integer' }]),
    });
    expect(rep.statusCode).toBe(201);

    // el registro creado bajo `title` sobrevive ahora bajo `name`
    const res = await app.inject({ method: 'GET', url: `/api/v1/products/${createdId}`, headers: { host: 'tienda.localhost' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Camisa');
    expect(res.json().data.price).toBeNull();
  });
});
