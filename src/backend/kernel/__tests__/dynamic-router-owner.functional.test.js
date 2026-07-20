/**
 * Pruebas funcionales del router dinámico con owner filter.
 * Verifica que los endpoints con acceso restringido por owner
 * (user-scoped) filtran correctamente registros según el usuario autenticado.
 *
 * @module KernelDynamicRouterOwnerFunctionalTest
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
import { tenantProviders, roles, userRoles, tenantUsers } from '../../config/drizzle/schema-tenant.js';
import { uuidv7 } from '../../common/id.js';
import { encrypt } from '../../common/crypto.js';
import { signAccessToken } from '../../common/jwt.js';
import { makePublishContract } from '../../feature/manage-platform-backend/application/publish-contract.usecase.js';
import { createContractRepository } from '../../infrastructure/no-code/contract.repository.js';
import { createNeonStore } from '../../infrastructure/providers/neon-tech.adapter.js';
import { closeAllStores } from '../../infrastructure/no-code/store-resolver.js';
import { buildApp } from '../app.js';

const URI = process.env.TEST_URI_CONECTION_NEONTECH;
const suite = URI ? describe : describe.skip;
const PHYS = `baas_test_dispatch_owner_${Date.now()}`; // tabla física única

suite('dispatcher No-Code — Restricción Owner (funcional · Neon real)', () => {
  let app;
  let tmp;
  let originalDir;
  let user1Order1Id;
  let user2Order1Id;

  // JWTs para autenticar
  const user1Token = signAccessToken({ sub: 'user1', scope: 'user', tenantId: 't1' });
  const user2Token = signAccessToken({ sub: 'user2', scope: 'user', tenantId: 't1' });
  const masterToken = signAccessToken({ sub: 'master1', scope: 'tenant', tenantId: 't1' });

  beforeAll(async () => {
    migratePlatform();
    originalDir = env.TENANTS_DB_DIR;
    tmp = mkdtempSync(join(tmpdir(), 'baas-dispatch-owner-'));
    env.TENANTS_DB_DIR = tmp;

    const now = Date.now();
    platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
    migrateTenant('t1');

    const sqlite = new Database(join(tmp, 't1.db'));
    const db = drizzle(sqlite);
    
    // Configurar Neon
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

    // Crear usuario master1 en tenant_users (requerido por FK)
    db.insert(tenantUsers).values({
      id: 'master1',
      email: 'master@tienda.com',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Crear rol Master para el staff y asignárselo a 'master1'
    db.insert(roles).values({
      id: 'r-master',
      name: 'master',
      category: 'staff',
      isReserved: 1,
      permissionsJson: '{}',
      createdAt: now,
      updatedAt: now,
    }).run();
    db.insert(userRoles).values({
      userId: 'master1',
      roleId: 'r-master',
      assignedAt: now,
    }).run();

    // Publicar contrato con resource 'orders' (tiene columna 'user_id') y endpoints con acceso 'owner'
    await makePublishContract({ contractRepository: createContractRepository({ db }) })({
      contract: {
        version: 'v1',
        stores: { sql: { provider: 'neon', enabled: true } },
        resources: [{
          name: 'orders', store: 'sql', physicalName: PHYS,
          fields: [
            { id: 'f1', name: 'title', type: 'string', required: true },
            { id: 'f2', name: 'user_id', type: 'string' }
          ],
        }],
        endpoints: [{
          path: '/orders',
          resource: 'orders',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          access: {
            GET: ['owner'],
            POST: ['owner'],
            PUT: ['owner'],
            DELETE: ['owner']
          }
        }],
        auth: { userAuthEnabled: true },
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

  const api = (method, url, token, body = null) => {
    const headers = { host: 'tienda.localhost' };
    if (token) headers.authorization = `Bearer ${token}`;
    return app.inject({ method, url, headers, ...(body ? { payload: body } : {}) });
  };

  it('POST /api/v1/orders como User 1 asigna automáticamente user_id = user1', async () => {
    const res = await api('POST', '/api/v1/orders', user1Token, { title: 'Orden User 1' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.title).toBe('Orden User 1');
    expect(res.json().data.user_id).toBe('user1');
    user1Order1Id = res.json().data.id;
  });

  it('POST /api/v1/orders como User 2 asigna automáticamente user_id = user2', async () => {
    const res = await api('POST', '/api/v1/orders', user2Token, { title: 'Orden User 2' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.title).toBe('Orden User 2');
    expect(res.json().data.user_id).toBe('user2');
    user2Order1Id = res.json().data.id;
  });

  it('GET /api/v1/orders como User 1 retorna solo las órdenes de User 1', async () => {
    const res = await api('GET', '/api/v1/orders', user1Token);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(user1Order1Id);
    expect(data[0].user_id).toBe('user1');
  });

  it('GET /api/v1/orders/:id de User 2 por User 1 retorna 403 Forbidden', async () => {
    const res = await api('GET', `/api/v1/orders/${user2Order1Id}`, user1Token);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/orders/:id de User 1 por User 1 retorna 200 OK', async () => {
    const res = await api('GET', `/api/v1/orders/${user1Order1Id}`, user1Token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Orden User 1');
  });

  it('PUT /api/v1/orders/:id de User 2 por User 1 retorna 403 Forbidden', async () => {
    const res = await api('PUT', `/api/v1/orders/${user2Order1Id}`, user1Token, { title: 'Hack' });
    expect(res.statusCode).toBe(403);
  });

  it('PUT /api/v1/orders/:id de User 1 por User 1 actualiza con éxito y no permite transferir propiedad', async () => {
    const res = await api('PUT', `/api/v1/orders/${user1Order1Id}`, user1Token, { title: 'Orden User 1 Modificada', user_id: 'otro_user' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Orden User 1 Modificada');
    expect(res.json().data.user_id).toBe('user1'); // Sigue siendo user1, ignoró 'otro_user'
  });

  it('DELETE /api/v1/orders/:id de User 2 por User 1 retorna 403 Forbidden', async () => {
    const res = await api('DELETE', `/api/v1/orders/${user2Order1Id}`, user1Token);
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /api/v1/orders/:id de User 1 por User 1 retorna 200 OK', async () => {
    const res = await api('DELETE', `/api/v1/orders/${user1Order1Id}`, user1Token);
    expect(res.statusCode).toBe(200);
  });

  it('Master puede ver el detalle de la orden de User 2 (Bypass Owner check)', async () => {
    const res = await api('GET', `/api/v1/orders/${user2Order1Id}`, masterToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Orden User 2');
  });
});
