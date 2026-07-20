/**
 * Pruebas funcionales del endpoint OpenAPI /api/v1/openapi.json.
 * Verifica que el spec generado refleja el contrato publicado del tenant,
 * incluyendo paths, métodos y estructura OpenAPI 3.x.
 *
 * @module KernelOpenapiFunctionalTest
 */
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
import { makePublishContract } from '../../feature/manage-platform-backend/application/publish-contract.usecase.js';
import { createContractRepository } from '../../infrastructure/no-code/contract.repository.js';
import { buildApp } from '../app.js';

let app;
let tmp;
let originalDir;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-openapi-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  await makePublishContract({ contractRepository: createContractRepository({ db: drizzle(sqlite) }) })({
    contract: {
      version: 'v1',
      stores: { sql: { provider: 'neon', enabled: true } },
      resources: [{ name: 'products', store: 'sql', physicalName: 'products_db', fields: [{ id: 'f1', name: 'title', type: 'string', required: true }] }],
      endpoints: [{ path: '/products', resource: 'products', methods: ['GET', 'POST'] }],
      auth: { userAuthEnabled: false },
    },
  });
  sqlite.close();

  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('GET /api/:version/openapi.json (funcional)', () => {
  it('sirve el contrato OpenAPI del backend publicado', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json', headers: { host: 'tienda.localhost' } });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/products'].get).toBeDefined();
    expect(doc.paths['/products'].post).toBeDefined();
    expect(doc.components.schemas.products.required).toContain('title');
  });
});
