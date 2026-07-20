/**
 * Pruebas funcionales del feature auth-user (register + login + logout + refresh).
 * Cubre: registro válido, email duplicado, validación, login con y sin passphrase,
 * refresh de sesión, logout, aislamiento cross-tenant de sesiones y
 * aislamiento cross-scope (token user no accede a rutas admin).
 *
 * @module AuthUserFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants } from '../../../config/drizzle/schema-platform.js';
import { roles as rolesTable, tenantUsers, userRoles } from '../../../config/drizzle/schema-tenant.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

const HOST = 'shop.localhost';
const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let masterToken;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-auth-user-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  const db = drizzle(sqlite);
  // Master seed para el cross-scope test.
  db.insert(rolesTable).values({ id: 'r-master', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db.insert(tenantUsers).values({
    id: 'u-master', email: 'master@shop.com',
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db.insert(userRoles).values({ userId: 'u-master', roleId: 'r-master', assignedAt: now }).run();
  sqlite.close();

  app = await buildApp();
  const login = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    headers: { host: HOST },
    payload: { email: 'master@shop.com', password: PW, passphrase: PP },
  });
  masterToken = login.json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Helper que registra un end-user en el tenant via POST /api/v1/auth/register.
 * @param {Object} payload - Cuerpo del registro ({ email, password }).
 * @param {Object} [headers] - Headers adicionales.
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const register = (payload, headers = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { host: HOST, ...headers }, payload });
/**
 * Helper que loguea un end-user via POST /api/v1/auth/login.
 * @param {Object} payload - Credenciales ({ email, password }).
 * @param {Object} [headers] - Headers adicionales.
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const loginUser = (payload, headers = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { host: HOST, ...headers }, payload });

describe('auth-user — register + login flow', () => {
  it('register válido → 201 + { userId, email } + user persistido + rol user auto-provisionado', async () => {
    const res = await register({ email: 'ana@shop.com', password: 'MyPass1234' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ email: 'ana@shop.com' });
    expect(res.json().data.userId).toBeTypeOf('string');

    const sqlite = new Database(join(tmp, 't1.db'));
    const user = sqlite.prepare('SELECT email, auth_provider, status, passphrase_hash FROM tenant_users WHERE email=?').get('ana@shop.com');
    expect(user).toMatchObject({ email: 'ana@shop.com', auth_provider: 'local', status: 'active' });
    expect(user.passphrase_hash).toBeNull();
    // Rol `user` creado
    const role = sqlite.prepare('SELECT name, category FROM roles WHERE name=?').get('user');
    expect(role).toMatchObject({ name: 'user', category: 'user' });
    sqlite.close();
  });

  it('register email duplicado → 422 EMAIL_TAKEN', async () => {
    const res = await register({ email: 'ana@shop.com', password: 'MyPass1234' });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('EMAIL_TAKEN');
  });

  it('register email inválido / password < 8 → 400 VALIDATION_ERROR', async () => {
    expect((await register({ email: 'no-email', password: 'MyPass1234' })).statusCode).toBe(400);
    expect((await register({ email: 'x@y.com', password: 'short' })).statusCode).toBe(400);
  });

  it('login válido → 200 + accessToken + user_sid cookie', async () => {
    const res = await loginUser({ email: 'ana@shop.com', password: 'MyPass1234' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.accessToken).toBeTypeOf('string');
    const userSid = res.cookies.find((c) => c.name === 'user_sid');
    expect(userSid).toBeDefined();
    expect(userSid.value).toBeTruthy();
  });

  it('login password incorrecto → 401 INVALID_CREDENTIALS', async () => {
    const res = await loginUser({ email: 'ana@shop.com', password: 'nope' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_CREDENTIALS');
  });

  it('login con credenciales de Master (tiene passphraseHash) → 401 FORBIDDEN_ADMIN_LOGIN', async () => {
    const res = await loginUser({ email: 'master@shop.com', password: PW });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('FORBIDDEN_ADMIN_LOGIN');
  });

  it('rutas de auth en apex (sin tenant) → 404 (no hay tenant contra el cual autenticarse)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'x@y.com', password: 'MyPass1234' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('auth-user — logout + refresh', () => {
  let userSid;

  beforeAll(async () => {
    const res = await loginUser({ email: 'ana@shop.com', password: 'MyPass1234' });
    userSid = res.cookies.find((c) => c.name === 'user_sid').value;
  });

  it('refresh con sesión viva → 200 + nuevo accessToken', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/refresh',
      headers: { host: HOST },
      cookies: { user_sid: userSid },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.accessToken).toBeTypeOf('string');
  });

  it('refresh sin cookie → 401 INVALID_SESSION', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { host: HOST } });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_SESSION');
  });

  it('refresh en apex (sin tenant) → 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(res.statusCode).toBe(404);
  });

  it('logout revoca la sesión: refresh posterior → 401', async () => {
    const loginRes = await loginUser({ email: 'ana@shop.com', password: 'MyPass1234' });
    const sid = loginRes.cookies.find((c) => c.name === 'user_sid').value;

    const logoutRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/logout',
      headers: { host: HOST },
      cookies: { user_sid: sid },
    });
    expect(logoutRes.statusCode).toBe(200);
    // Cookie limpia
    const clear = logoutRes.cookies.find((c) => c.name === 'user_sid');
    expect(clear?.value).toBe('');

    // Refresh con la misma cookie ya no funciona
    const refreshRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/refresh',
      headers: { host: HOST },
      cookies: { user_sid: sid },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('logout sin cookie → 200 (idempotente)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { host: HOST } });
    expect(res.statusCode).toBe(200);
  });

  it('cross-tenant: sesión válida en tenant A no refresca en tenant B', async () => {
    const now = Date.now();
    platformDb.insert(tenants).values({ id: 't2', subdomain: 'otra', status: 'active', createdAt: now, updatedAt: now }).run();
    migrateTenant('t2');
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/refresh',
      headers: { host: 'otra.localhost' },
      cookies: { user_sid: userSid },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('auth-user — cross-scope isolation', () => {
  let userToken;

  beforeAll(async () => {
    const res = await loginUser({ email: 'ana@shop.com', password: 'MyPass1234' });
    userToken = res.json().data.accessToken;
  });

  it('token de end-user NO puede llegar a rutas administrativas del subdominio (/dashboard/staff → redirect)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/dashboard/staff',
      headers: { host: HOST, authorization: `Bearer ${userToken}` },
    });
    // El requireCategory('master') redirect al login (user no es master).
    expect([302, 403]).toContain(res.statusCode);
  });

  it('token de end-user NO puede autorar backends en apex (`/api-system/v1/tenants/*/backends`) → 403', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api-system/v1/tenants/t1/backends',
      headers: { authorization: `Bearer ${userToken}` },
    });
    // Apex + scope=user (no platform) → session-auth deja request.user=null → guard 403.
    expect(res.statusCode).toBe(403);
  });

  it('token de Master NO puede usar el endpoint de user (login retorna FORBIDDEN_ADMIN_LOGIN, ya probado). Master tampoco puede pasar por register.', async () => {
    // Un master ya está registrado — intentar register otra vez con su email → 422 EMAIL_TAKEN.
    const res = await register({ email: 'master@shop.com', password: 'MyPass1234' });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('EMAIL_TAKEN');
  });
});
