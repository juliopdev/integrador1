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
import { roles, tenantUsers, userRoles } from '../../../config/drizzle/schema-tenant.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let masterToken;
let colabToken;
let colabSid;

async function seedUser(db, { id, email, roleId, now }) {
  db.insert(tenantUsers).values({ id, email, passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP), status: 'active', createdAt: now, updatedAt: now }).run();
  db.insert(userRoles).values({ userId: id, roleId, assignedAt: now }).run();
}

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-staffmgmt-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  const db = drizzle(sqlite);
  db.insert(roles).values([
    { id: 'r-master', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now },
    { id: 'r-inv', name: 'inventory', category: 'staff', isReserved: 0, createdAt: now, updatedAt: now },
    { id: 'r-mkt', name: 'marketing', category: 'staff', isReserved: 0, createdAt: now, updatedAt: now },
  ]).run();
  await seedUser(db, { id: 'u-master', email: 'master@tienda.com', roleId: 'r-master', now });
  await seedUser(db, { id: 'u-colab', email: 'colab@tienda.com', roleId: 'r-inv', now });
  sqlite.close();

  app = await buildApp();
  const login = (email) => app.inject({ method: 'POST', url: '/api-system/v1/login', headers: { host: 'tienda.localhost' }, payload: { email, password: PW, passphrase: PP } });
  masterToken = (await login('master@tienda.com')).json().data.accessToken;
  const colabLogin = await login('colab@tienda.com');
  colabToken = colabLogin.json().data.accessToken;
  colabSid = colabLogin.cookies.find((c) => c.name === 'tenant_sid').value;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const asMaster = (method, url, body) =>
  app.inject({ method, url, headers: { host: 'tienda.localhost', authorization: `Bearer ${masterToken}` }, ...(body ? { payload: body } : {}) });
const rolesOf = async (email) => (await asMaster('GET', '/api-system/v1/staff')).json().data.data.find((u) => u.email === email)?.roles;

describe('manage-master-staff · gestión (funcional)', () => {
  it('GET /staff lista colaboradores con sus roles', async () => {
    const res = await asMaster('GET', '/api-system/v1/staff');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.data.find((u) => u.email === 'colab@tienda.com').roles).toEqual(['inventory']);
  });

  it('rbac: un Staff no puede listar → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/api-system/v1/staff', headers: { host: 'tienda.localhost', authorization: `Bearer ${colabToken}` } });
    expect(res.statusCode).toBe(403);
  });

  it('asigna y revoca roles (N:M)', async () => {
    expect((await asMaster('PUT', '/api-system/v1/staff/u-colab/roles', { roleId: 'r-mkt', action: 'assign' })).statusCode).toBe(200);
    expect((await rolesOf('colab@tienda.com')).sort()).toEqual(['inventory', 'marketing']);

    expect((await asMaster('PUT', '/api-system/v1/staff/u-colab/roles', { roleId: 'r-inv', action: 'revoke' })).statusCode).toBe(200);
    expect(await rolesOf('colab@tienda.com')).toEqual(['marketing']);
  });

  it('no permite ascender a un rol no-staff (master) → 422', async () => {
    const res = await asMaster('PUT', '/api-system/v1/staff/u-colab/roles', { roleId: 'r-master', action: 'assign' });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('ROLE_NOT_ASSIGNABLE');
  });

  it('DELETE revoca acceso (soft-delete) e invalida la sesión del colaborador', async () => {
    expect((await asMaster('DELETE', '/api-system/v1/staff/u-colab')).statusCode).toBe(200);

    // ya no aparece en el listado
    const list = (await asMaster('GET', '/api-system/v1/staff')).json().data.data;
    expect(list.find((u) => u.email === 'colab@tienda.com')).toBeUndefined();

    // su sesión (cookie) quedó invalidada
    const me = await app.inject({ method: 'GET', url: '/api-system/v1/me', headers: { host: 'tienda.localhost' }, cookies: { tenant_sid: colabSid } });
    expect(me.statusCode).toBe(401);
  });
});
