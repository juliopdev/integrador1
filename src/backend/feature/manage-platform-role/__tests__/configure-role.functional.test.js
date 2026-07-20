/**
 * Pruebas funcionales del feature manage-platform-role (creación de roles).
 * Verifica: Superadmin crea rol Staff, rechaza nombres reservados
 * y requiere sesión de Superadmin (403 si anónimo).
 *
 * @module ManagePlatformRoleFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers, tenants } from '../../../config/drizzle/schema-platform.js';
import { hashSecret } from '../../../common/password.js';
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
  tmp = mkdtempSync(join(tmpdir(), 'baas-roles-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(platformUsers).values({ id: 'sa', email: 'super@baas.com', passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP), createdAt: now, updatedAt: now }).run();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  app = await buildApp();
  superToken = (await app.inject({ method: 'POST', url: '/api-system/v1/login', payload: { email: 'super@baas.com', password: PW, passphrase: PP } })).json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Helper que crea un rol via POST /api-system/v1/tenants/t1/roles.
 * @param {Object} body - { name, permissions }.
 * @param {string|null} [token=superToken] - Bearer JWT o null para anónimo.
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const createRole = (body, token = superToken) =>
  app.inject({ method: 'POST', url: '/api-system/v1/tenants/t1/roles', headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body });

describe('POST /api-system/v1/tenants/:id/roles (funcional)', () => {
  it('el Superadmin crea un rol de Staff → 201 + persistido en tenant.db', async () => {
    const res = await createRole({ name: 'inventory', permissions: { v1: { products: ['GET', 'POST'] } } });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe('inventory');

    const sqlite = new Database(join(tmp, 't1.db'));
    const role = sqlite.prepare("SELECT name, category FROM roles WHERE name = 'inventory'").get();
    sqlite.close();
    expect(role).toMatchObject({ name: 'inventory', category: 'staff' });
  });

  it('rechaza un nombre reservado → 422', async () => {
    const res = await createRole({ name: 'master', permissions: {} });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('RESERVED_ROLE');
  });

  it('sin sesión de Superadmin → 403', async () => {
    const res = await createRole({ name: 'marketing', permissions: {} }, null);
    expect(res.statusCode).toBe(403);
  });
});
