import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers, tenants } from '../../../config/drizzle/schema-platform.js';
import { hashSecret } from '../../../common/password.js';
import { makePublishContract } from '../application/publish-contract.usecase.js';
import { createContractRepository } from '../../../infrastructure/no-code/contract.repository.js';
import { buildApp } from '../../../kernel/app.js';

const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let superToken;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-backendops-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(platformUsers).values({ id: 'sa', email: 'super@baas.com', passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP), createdAt: now, updatedAt: now }).run();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  await makePublishContract({ contractRepository: createContractRepository({ db: drizzle(sqlite) }) })({
    contract: {
      version: 'v1',
      stores: { sql: { provider: 'neon', enabled: true } },
      resources: [{ name: 'products', store: 'sql', physicalName: 'products_db', fields: [{ id: 'f1', name: 'title', type: 'string', required: true }] }],
      endpoints: [{ path: '/products', resource: 'products', methods: ['GET'] }],
      auth: { userAuthEnabled: false },
    },
  });
  sqlite.close();

  app = await buildApp();
  superToken = (await app.inject({ method: 'POST', url: '/api-system/v1/login', payload: { email: 'super@baas.com', password: PW, passphrase: PP } })).json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const sa = (method, url, body) =>
  app.inject({ method, url, headers: { authorization: `Bearer ${superToken}` }, ...(body ? { payload: body } : {}) });

describe('manage-platform-backend · gestión de contratos (funcional)', () => {
  it('GET /backends lista + GET /backends/:version detalla', async () => {
    const list = await sa('GET', '/api-system/v1/tenants/t1/backends');
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([expect.objectContaining({ version: 'v1', status: 'published' })]);

    const detail = await sa('GET', '/api-system/v1/tenants/t1/backends/v1');
    expect(detail.json().data.schema.resources[0].name).toBe('products');

    expect((await sa('GET', '/api-system/v1/tenants/t1/backends/v2')).statusCode).toBe(404);
  });

  it('PUT /backend/auth habilita la API Auth de Users', async () => {
    expect((await sa('PUT', '/api-system/v1/tenants/t1/backend/auth', { enabled: true, strategies: ['local'] })).statusCode).toBe(200);
    const detail = await sa('GET', '/api-system/v1/tenants/t1/backends/v1');
    expect(detail.json().data.schema.auth.userAuthEnabled).toBe(true);
  });

  it('PUT /backend/ws habilita un canal y rechaza uno inválido', async () => {
    expect((await sa('PUT', '/api-system/v1/tenants/t1/backend/ws', { channel: 'user_to_user', enabled: true })).statusCode).toBe(200);
    const detail = await sa('GET', '/api-system/v1/tenants/t1/backends/v1');
    expect(detail.json().data.schema.websocket.channels).toContain('user_to_user');

    const bad = await sa('PUT', '/api-system/v1/tenants/t1/backend/ws', { channel: 'no_existe', enabled: true });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().code).toBe('INVALID_CHANNEL');
  });

  it('rbac: sin Superadmin → 403', async () => {
    expect((await app.inject({ method: 'GET', url: '/api-system/v1/tenants/t1/backends' })).statusCode).toBe(403);
  });

  it('rechaza `:version` con formato inválido con 400 VALIDATION_ERROR', async () => {
    const res = await sa('GET', '/api-system/v1/tenants/t1/backends/no-es-version');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');

    const del = await sa('DELETE', '/api-system/v1/tenants/t1/backends/no-es-version');
    expect(del.statusCode).toBe(400);
    expect(del.json().code).toBe('VALIDATION_ERROR');
  });



  it('DELETE /backends/:version retira el contrato (lógico)', async () => {
    expect((await sa('DELETE', '/api-system/v1/tenants/t1/backends/v1')).statusCode).toBe(200);
    const list = await sa('GET', '/api-system/v1/tenants/t1/backends');
    expect(list.json().data[0].status).toBe('retired');
  });
});
