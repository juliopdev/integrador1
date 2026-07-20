/**
 * Pruebas funcionales del resolvedor de acceso dinámico.
 * Verifica que las audiencias (public, user, owner) se aplican
 * correctamente en el dispatcher No-Code con app completa.
 *
 * @module KernelDynamicAccessFunctionalTest
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
import { apiKeys } from '../../config/drizzle/schema-tenant.js';
import { uuidv7 } from '../../common/id.js';
import { hashToken } from '../../common/token.js';
import { signAccessToken } from '../../common/jwt.js';
import { makePublishContract } from '../../feature/manage-platform-backend/application/publish-contract.usecase.js';
import { createContractRepository } from '../../infrastructure/no-code/contract.repository.js';
import { buildApp } from '../app.js';

// P6b: enforcement de audiencias del dispatcher — caminos de denegación (401/403) que cortan
// ANTES de resolver el store, por eso NO exigen Neon (a diferencia de dynamic-router.functional).
// El camino feliz completo (auth OK + CRUD real) vive en la suite gated contra Neon.

const RAW_KEY = 'mbk_test_functional_access_key';

describe('dispatcher No-Code — audiencias por método (funcional, sin store)', () => {
  let app;
  let tmp;
  let originalDir;

  const api = (method, url, headers = {}) =>
    app.inject({ method, url, headers: { host: 'acceso.localhost', ...headers } });

  beforeAll(async () => {
    migratePlatform();
    originalDir = env.TENANTS_DB_DIR;
    tmp = mkdtempSync(join(tmpdir(), 'baas-access-'));
    env.TENANTS_DB_DIR = tmp;

    const now = Date.now();
    platformDb.insert(tenants).values({ id: 'tacc', subdomain: 'acceso', status: 'active', createdAt: now, updatedAt: now }).run();
    migrateTenant('tacc');

    const sqlite = new Database(join(tmp, 'tacc.db'));
    const db = drizzle(sqlite);
    // API key "frontend" activa (solo hash — igual que generate-api-key).
    db.insert(apiKeys).values({
      id: uuidv7(), name: 'frontend', tokenHash: hashToken(RAW_KEY),
      scopesJson: JSON.stringify(['frontend']), status: 'active', createdAt: now, updatedAt: now,
    }).run();
    // Contrato publicado con access restrictivo (publicar NO compila stores — eso es aparte).
    await makePublishContract({ contractRepository: createContractRepository({ db }) })({
      contract: {
        version: 'v1',
        stores: { sql: { provider: 'neon', enabled: true } },
        resources: [{
          name: 'products', store: 'sql', physicalName: 'products_db',
          fields: [{ id: 'f1', name: 'title', type: 'string', required: true }],
        }],
        endpoints: [{
          path: '/products', resource: 'products', methods: ['GET', 'POST', 'PUT'],
          access: { GET: ['user'], POST: ['user'], PUT: ['editor'] },
        }],
        auth: { userAuthEnabled: true, strategies: ['local'] },
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

  it('método protegido sin credencial → 401 (corta antes del store)', async () => {
    const res = await api('GET', '/api/v1/products');
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('Bearer basura → 401', async () => {
    const res = await api('GET', '/api/v1/products', { authorization: 'Bearer no-es-nada' });
    expect(res.statusCode).toBe(401);
  });

  it('JWT de User de OTRO tenant → 401 (anti cross-tenant)', async () => {
    const token = signAccessToken({ sub: 'u1', scope: 'user', tenantId: 'otro-tenant' });
    const res = await api('GET', '/api/v1/products', { authorization: `Bearer ${token}` });
    expect(res.statusCode).toBe(401);
  });

  it('Staff sin el rol exigido → 403 en método restringido por rol', async () => {
    const token = signAccessToken({ sub: 'staff-sin-rol', scope: 'tenant', tenantId: 'tacc' });
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/products/x1',
      headers: { host: 'acceso.localhost', authorization: `Bearer ${token}` },
      payload: { title: 'x' }, // body json válido: el 403 debe venir del gate, no del parser
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('JWT de User del tenant pasa el gate (el fallo posterior ya no es de auth)', async () => {
    const token = signAccessToken({ sub: 'u1', scope: 'user', tenantId: 'tacc' });
    const res = await api('GET', '/api/v1/products', { authorization: `Bearer ${token}` });
    expect([401, 403]).not.toContain(res.statusCode); // sin provider linkeado: error de store, no de auth
  });

  it('API key mbk_ válida pasa el gate y sella last_used_at', async () => {
    const res = await api('GET', '/api/v1/products', { authorization: `Bearer ${RAW_KEY}` });
    expect([401, 403]).not.toContain(res.statusCode);

    const sqlite = new Database(join(tmp, 'tacc.db'));
    const row = sqlite.prepare("SELECT last_used_at FROM api_keys WHERE name = 'frontend'").get();
    sqlite.close();
    expect(row.last_used_at).toBeTypeOf('number');
  });
});
