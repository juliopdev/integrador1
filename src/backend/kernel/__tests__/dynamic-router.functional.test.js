/**
 * Pruebas funcionales del router dinámico No-Code (dispatcher).
 * Verifica que los endpoints declarados en el contrato se resuelven
 * contra el store y que las rutas del sistema conviven sin conflicto.
 *
 * @module KernelDynamicRouterFunctionalTest
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../config/env.js';
import { migratePlatform, migrateTenant } from '../../config/drizzle/migrator.js';
import { platformDb } from '../../config/database/platform/sqlite-platform.js';
import { tenants } from '../../config/drizzle/schema-platform.js';
import { tenantProviders } from '../../config/drizzle/schema-tenant.js';
import { uuidv7 } from '../../common/id.js';
import { encrypt } from '../../common/crypto.js';
import { makePublishContract } from '../../feature/manage-platform-backend/application/publish-contract.usecase.js';
import { createContractRepository } from '../../infrastructure/no-code/contract.repository.js';
import { createNeonStore } from '../../infrastructure/providers/neon-tech.adapter.js';
import { closeAllStores } from '../../infrastructure/no-code/store-resolver.js';
import { buildApp } from '../app.js';

const URI = process.env.TEST_URI_CONECTION_NEONTECH;
const suite = URI ? describe : describe.skip;
const PHYS = `baas_test_dispatch_${Date.now()}`; // tabla física única (se elimina al final)

suite('dispatcher No-Code /api/:version/* (funcional · Neon real)', () => {
  let app;
  let tmp;
  let originalDir;
  let createdId;

  beforeAll(async () => {
    migratePlatform();
    originalDir = env.TENANTS_DB_DIR;
    tmp = mkdtempSync(join(tmpdir(), 'baas-dispatch-'));
    env.TENANTS_DB_DIR = tmp;

    const now = Date.now();
    platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
    migrateTenant('t1');

    const sqlite = new Database(join(tmp, 't1.db'));
    const db = drizzle(sqlite);
    // proveedor de datos del tenant: URI de Neon cifrada
    const box = encrypt(JSON.stringify({ uri: URI }));
    db.insert(tenantProviders).values({
      id: uuidv7(),
      category: 'database',
      provider: 'neon',
      configValuesJson: JSON.stringify(box),
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    }).run();
    // publicar el contrato (resource products → endpoint /products)
    await makePublishContract({ contractRepository: createContractRepository({ db }) })({
      contract: {
        version: 'v1',
        stores: { sql: { provider: 'neon', enabled: true } },
        resources: [{
          name: 'products', store: 'sql', physicalName: PHYS,
          fields: [{ id: 'f1', name: 'title', type: 'string', required: true }, { id: 'f2', name: 'price', type: 'integer' }],
        }],
        endpoints: [{ path: '/products', resource: 'products', methods: ['GET', 'POST', 'PUT', 'DELETE'] }],
        auth: { userAuthEnabled: false },
      },
    });
    sqlite.close();

    app = await buildApp();
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

  const api = (method, url, body) =>
    app.inject({ method, url, headers: { host: 'tienda.localhost' }, ...(body ? { payload: body } : {}) });

  it('POST /api/v1/products crea una fila en Neon → 201', async () => {
    const res = await api('POST', '/api/v1/products', { title: 'Camisa', price: 100 });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ title: 'Camisa' });
    expect(typeof res.json().data.id).toBe('string');
    createdId = res.json().data.id;
  });

  it('GET /api/v1/products lista las filas', async () => {
    const res = await api('GET', '/api/v1/products');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.some((r) => r.id === createdId)).toBe(true);
  });

  it('GET /api/v1/products/:id devuelve la fila', async () => {
    const res = await api('GET', `/api/v1/products/${createdId}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Camisa');
  });

  it('PUT /api/v1/products/:id actualiza', async () => {
    const res = await api('PUT', `/api/v1/products/${createdId}`, { title: 'Camisa azul' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Camisa azul');
  });

  it('POST con body inválido (falta title) → 400', async () => {
    const res = await api('POST', '/api/v1/products', { price: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /api/v1/products/:id borra lógico; luego 404', async () => {
    expect((await api('DELETE', `/api/v1/products/${createdId}`)).statusCode).toBe(200);
    expect((await api('GET', `/api/v1/products/${createdId}`)).statusCode).toBe(404);
  });

  it('endpoint inexistente → 404', async () => {
    expect((await api('GET', '/api/v1/unknown')).statusCode).toBe(404);
  });
});
