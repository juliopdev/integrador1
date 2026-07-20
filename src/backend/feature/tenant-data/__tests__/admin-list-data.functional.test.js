/**
 * Pruebas funcionales del feature tenant-data (SSR views + API CRUD).
 * Cubre: RBAC (SSR redirect / API 401), resource not found (404),
 * store sin Neon (503), listing view, detail view, create form,
 * validación POST/PUT (422), y empty-state para tenant sin contrato.
 *
 * @module TenantDataAdminListFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants } from '../../../config/drizzle/schema-platform.js';
import { roles as rolesTable, tenantUsers, userRoles } from '../../../config/drizzle/schema-tenant.js';
import { hashSecret } from '../../../common/password.js';
import { makePublishContract } from '../../manage-platform-backend/application/publish-contract.usecase.js';
import { createContractRepository } from '../../../infrastructure/no-code/contract.repository.js';
import { buildApp } from '../../../kernel/app.js';

// Suite consolidado (Iter consolidación 2026-07): antes 24 tests granulares con mucha repetición
// (sin sesión → 302 en cada verbo, resource-not-found en cada verbo, sin Neon en cada verbo).
// Ahora 10 tests agrupados: los negativos comunes van en tablas parametrizadas, y cada test
// felíz cubre varias aserciones sobre el mismo setup.

const HOST = 'shop.localhost';
const HOST_EMPTY = 'empty.localhost';
const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let masterToken;
let emptyToken;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-tenant-data-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values([
    { id: 't1', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now },
    { id: 't2', subdomain: 'empty', status: 'active', createdAt: now, updatedAt: now },
  ]).run();
  migrateTenant('t1');
  migrateTenant('t2');

  // t1: Master + contrato v1 con products + orders.
  const sqlite = new Database(join(tmp, 't1.db'));
  const db = drizzle(sqlite);
  db.insert(rolesTable).values({ id: 'r-master', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db.insert(tenantUsers).values({
    id: 'u-master', email: 'master@shop.com',
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db.insert(userRoles).values({ userId: 'u-master', roleId: 'r-master', assignedAt: now }).run();
  await makePublishContract({ contractRepository: createContractRepository({ db }) })({
    contract: {
      version: 'v1',
      stores: { sql: { provider: 'neon', enabled: true } },
      resources: [
        { name: 'products', store: 'sql', physicalName: 'products_db', fields: [
          { id: 'f1', name: 'title', type: 'string', required: true },
          { id: 'f2', name: 'price', type: 'float' },
        ] },
        { name: 'orders', store: 'sql', physicalName: 'orders_db', fields: [
          { id: 'f3', name: 'total', type: 'float' },
        ] },
      ],
      endpoints: [
        { path: '/products', resource: 'products', methods: ['GET', 'POST'] },
        { path: '/orders', resource: 'orders', methods: ['GET'] },
      ],
      auth: { userAuthEnabled: false },
    },
  });
  sqlite.close();

  // t2: Master sin contrato publicado.
  const sqlite2 = new Database(join(tmp, 't2.db'));
  const db2 = drizzle(sqlite2);
  db2.insert(rolesTable).values({ id: 'r-master-2', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db2.insert(tenantUsers).values({
    id: 'u-master-2', email: 'master@empty.com',
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db2.insert(userRoles).values({ userId: 'u-master-2', roleId: 'r-master-2', assignedAt: now }).run();
  sqlite2.close();

  app = await buildApp();

  const login = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    headers: { host: HOST }, payload: { email: 'master@shop.com', password: PW, passphrase: PP },
  });
  masterToken = login.json().data.accessToken;

  const loginEmpty = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    headers: { host: HOST_EMPTY }, payload: { email: 'master@empty.com', password: PW, passphrase: PP },
  });
  emptyToken = loginEmpty.json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Helper: request autenticado como Master del tenant shop.
 * @param {string} method - HTTP method.
 * @param {string} url - Ruta.
 * @param {Object} [payload] - Cuerpo de la request.
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const injectMaster = (method, url, payload) => app.inject({
  method, url, headers: { host: HOST, authorization: `Bearer ${masterToken}` },
  ...(payload ? { payload } : {}),
});
/**
 * Helper: request anónima (sin autenticación).
 * @param {string} method - HTTP method.
 * @param {string} url - Ruta.
 * @param {Object} [payload] - Cuerpo de la request.
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const injectAnon = (method, url, payload) => app.inject({
  method, url, headers: { host: HOST }, ...(payload ? { payload } : {}),
});

describe('tenant-data — vistas SSR + API CRUD', () => {
  // ─── RBAC: SSR redirect / API 401 ────────────────────────────────────────
  it('sin sesión: SSR redirige a login; API devuelve 401 UNAUTHENTICATED', async () => {
    const ssrRoutes = [
      '/dashboard/data',
      '/dashboard/data/products',
      '/dashboard/data/products/create',
      '/dashboard/data/products/r1/edit',
    ];
    for (const url of ssrRoutes) {
      const res = await injectAnon('GET', url);
      expect(res.statusCode, `SSR ${url}`).toBe(302);
      expect(res.headers.location).toBe('/dashboard/login');
    }

    const apiCases = [
      ['POST', '/api-system/v1/data/products', { title: 'x' }],
      ['PUT', '/api-system/v1/data/products/r1', { title: 'x' }],
      ['DELETE', '/api-system/v1/data/products/r1'],
    ];
    for (const [method, url, body] of apiCases) {
      const res = await injectAnon(method, url, body);
      expect(res.statusCode, `API ${method} ${url}`).toBe(401);
      expect(res.json().code).toBe('UNAUTHENTICATED');
    }
  });

  // ─── 404 RESOURCE_NOT_FOUND en cada endpoint ─────────────────────────────
  it('resource inexistente → 404 RESOURCE_NOT_FOUND en SSR + API', async () => {
    const cases = [
      ['GET', '/dashboard/data/nope'],
      ['GET', '/dashboard/data/nope/create'],
      ['GET', '/dashboard/data/nope/x/edit'],
      ['POST', '/api-system/v1/data/nope', { title: 'x' }],
      ['PUT', '/api-system/v1/data/nope/r1', { title: 'x' }],
      ['DELETE', '/api-system/v1/data/nope/r1'],
    ];
    for (const [method, url, body] of cases) {
      const res = await injectMaster(method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  // ─── 503 STORE_NOT_CONFIGURED en cada verbo ─────────────────────────────
  it('sin Neon linkeado → 503 STORE_NOT_CONFIGURED en cada verbo que toca el store', async () => {
    const cases = [
      ['POST', '/api-system/v1/data/products', { title: 'Camisa', price: 99.5 }],
      ['PUT', '/api-system/v1/data/products/r1', { title: 'nuevo' }],
      ['DELETE', '/api-system/v1/data/products/r1'],
      // El view de edit intenta findById → propaga el 503.
      ['GET', '/dashboard/data/products/r1/edit'],
    ];
    for (const [method, url, body] of cases) {
      const res = await injectMaster(method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(503);
      expect(res.json().code).toBe('STORE_NOT_CONFIGURED');
    }
  });

  // ─── Listing view ───────────────────────────────────────────────────────
  it('GET /dashboard/data (Master) lista resources del contrato + activePath en sidebar', async () => {
    const res = await injectMaster('GET', '/dashboard/data');
    expect(res.statusCode).toBe(200);
    const html = res.body;
    expect(html).toContain('Gestor de Contenidos (CMS)');
    expect(html).toContain('products');
    expect(html).toContain('orders');
    expect(html).toContain('PostgreSQL');
    expect(html).toMatch(/href="\/dashboard\/data"[^>]*class="[^"]*c-sidebar__link--active/);
  });

  // ─── Detail view ────────────────────────────────────────────────────────
  it('GET /dashboard/data/:resource (Master) muestra schema + endpoints + estado sin proveedor', async () => {
    const res = await injectMaster('GET', '/dashboard/data/products');
    expect(res.statusCode).toBe(200);
    const html = res.body;
    expect(html).toContain('Products');
    expect(html).toContain('Estructura');
    expect(html).toContain('title');
    expect(html).toContain('price');
    expect(html).toContain('/products');
    expect(html).toContain('Sin proveedor de datos linkeado');
    expect(html).toContain('Postgres (Neon)');
    expect(html).toMatch(/href="\/dashboard\/data"[^>]*class="[^"]*c-sidebar__link--active/);
  });

  // ─── Create form ────────────────────────────────────────────────────────
  it('GET /dashboard/data/:resource/create renderiza dynamic-form derivado del schema', async () => {
    const res = await injectMaster('GET', '/dashboard/data/products/create');
    expect(res.statusCode).toBe(200);
    const html = res.body;
    expect(html).toContain('Nuevo registro en');
    expect(html).toContain('action="/api-system/v1/data/products"');
    expect(html).toContain('data-redirect="/dashboard/data/products"');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="price"');
    expect(html).toContain('type="number"');
    expect(html).toContain('Crear record');
  });

  // ─── POST validation (schema strict) ────────────────────────────────────
  it('POST body: falta requerido + claves inyectadas → 422 VALIDATION_ERROR sin tocar el store', async () => {
    // Falta title (requerido).
    const missing = await injectMaster('POST', '/api-system/v1/data/products', { price: 10 });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().code).toBe('VALIDATION_ERROR');

    // Clave inyectada (created_at) — schema strict rechaza extras.
    const injected = await injectMaster('POST', '/api-system/v1/data/products', { title: 'x', created_at: 999 });
    expect(injected.statusCode).toBe(422);
    expect(injected.json().code).toBe('VALIDATION_ERROR');
  });

  // ─── PUT validation ─────────────────────────────────────────────────────
  it('PUT body con claves inyectadas (deleted_at) → 422 VALIDATION_ERROR', async () => {
    const res = await injectMaster('PUT', '/api-system/v1/data/products/r1', { deleted_at: 0 });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  // ─── Empty tenant ────────────────────────────────────────────────────────
  it('tenant sin contrato publicado → empty-state con explicación (sin badge PostgreSQL)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/dashboard/data',
      headers: { host: HOST_EMPTY, authorization: `Bearer ${emptyToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Sin contrato publicado');
    expect(res.body).not.toContain('Postgres');
  });
});
