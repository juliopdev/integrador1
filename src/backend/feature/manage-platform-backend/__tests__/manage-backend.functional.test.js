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
const PHYS = `baas_test_authoring_${Date.now()}`;

const PW = 'Password123';
const PP = 'frase de paso larga';

const contract = () => ({
  version: 'v1',
  stores: { sql: { provider: 'neon', enabled: true } },
  resources: [{ name: 'products', store: 'sql', physicalName: PHYS, fields: [{ id: 'f1', name: 'title', type: 'string', required: true }] }],
  endpoints: [{ path: '/products', resource: 'products', methods: ['GET', 'POST'] }],
  auth: { userAuthEnabled: false },
});

suite('manage-platform-backend — asistente vía HTTP (funcional · Neon real)', () => {
  let app;
  let tmp;
  let originalDir;
  let superToken;

  beforeAll(async () => {
    migratePlatform();
    originalDir = env.TENANTS_DB_DIR;
    tmp = mkdtempSync(join(tmpdir(), 'baas-authoring-'));
    env.TENANTS_DB_DIR = tmp;

    const now = Date.now();
    platformDb.insert(platformUsers).values({ id: 'sa', email: 'super@baas.com', passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP), createdAt: now, updatedAt: now }).run();
    platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
    migrateTenant('t1');

    app = await buildApp();
    const login = await app.inject({ method: 'POST', url: '/api-system/v1/login', payload: { email: 'super@baas.com', password: PW, passphrase: PP } });
    superToken = login.json().data.accessToken;
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

  const asSuper = (method, url, body) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${superToken}` }, ...(body ? { payload: body } : {}) });

  it('sin sesión de Superadmin → 403', async () => {
    const res = await app.inject({ method: 'POST', url: '/api-system/v1/tenants/t1/providers', payload: { category: 'database', provider: 'neon', config: { uri: URI } } });
    expect(res.statusCode).toBe(403);
  });

  it('tenant inexistente → 404', async () => {
    const res = await asSuper('POST', '/api-system/v1/tenants/nope/providers', { category: 'database', provider: 'neon', config: { uri: URI } });
    expect(res.statusCode).toBe(404);
  });

  it('config de proveedor inválida (no conecta) → 422', async () => {
    const res = await asSuper('POST', '/api-system/v1/tenants/t1/providers', { category: 'database', provider: 'neon', config: { uri: 'postgresql://x:x@localhost:1/x' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('PROVIDER_CONNECTION_FAILED');
  });

  it('flujo completo: linkear Neon → publicar contrato → consumir el CRUD generado', async () => {
    // 1. linkear el proveedor (valida conexión real + cifra)
    expect((await asSuper('POST', '/api-system/v1/tenants/t1/providers', { category: 'database', provider: 'neon', config: { uri: URI } })).statusCode).toBe(200);

    // 2. publicar el contrato
    const pub = await asSuper('POST', '/api-system/v1/tenants/t1/backend', contract());
    expect(pub.statusCode).toBe(201);
    expect(pub.json().data.version).toBe('v1');

    // 3. consumir la API generada (subdominio del tenant) — cierra el lazo de punta a punta
    const create = await app.inject({ method: 'POST', url: '/api/v1/products', headers: { host: 'tienda.localhost' }, payload: { title: 'Camisa' } });
    expect(create.statusCode).toBe(201);
    expect(create.json().data.title).toBe('Camisa');

    const list = await app.inject({ method: 'GET', url: '/api/v1/products', headers: { host: 'tienda.localhost' } });
    expect(list.json().data).toHaveLength(1);
  });
});
