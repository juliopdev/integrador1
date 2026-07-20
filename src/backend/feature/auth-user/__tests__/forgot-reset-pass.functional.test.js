import 'dotenv/config';
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
import { tenantUsers, authTokens } from '../../../config/drizzle/schema-tenant.js';
import { uuidv7 } from '../../../common/id.js';
import { hashSecret } from '../../../common/password.js';
import { hashToken } from '../../../common/token.js';
import { buildApp } from '../../../kernel/app.js';

const HOST = 'shop.localhost';
const PW = 'MyPassword1234';

let app;
let tmp;
let originalDir;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-fp-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  drizzle(sqlite).insert(tenantUsers).values({
    id: 'u-ana', email: 'ana@shop.com',
    passwordHash: await hashSecret('OldPassword1234'), // Password vieja
    authProvider: 'local', status: 'active',
    createdAt: now, updatedAt: now,
  }).run();
  sqlite.close();

  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const forgot = (payload, headers = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/forgot-pass', headers: { host: HOST, ...headers }, payload });
const reset = (payload, headers = {}) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/reset-pass', headers: { host: HOST, ...headers }, payload });
const login = (payload) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { host: HOST }, payload });

describe('forgot-pass + reset-pass — flujo end-to-end (mailer no-op en test)', () => {
  it('email válido → 200 vacío, token `password_reset` creado en auth_tokens', async () => {
    const res = await forgot({ email: 'ana@shop.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();

    const sqlite = new Database(join(tmp, 't1.db'));
    const rows = sqlite.prepare('SELECT type, user_id FROM auth_tokens WHERE user_id=? ORDER BY created_at DESC').all('u-ana');
    sqlite.close();
    expect(rows[0]).toMatchObject({ type: 'password_reset', user_id: 'u-ana' });
  });

  it('email desconocido → 200 vacío (NO revela ausencia) + NO se crea token', async () => {
    const res = await forgot({ email: 'nadie@shop.com' });
    expect(res.statusCode).toBe(200);
    const sqlite = new Database(join(tmp, 't1.db'));
    const rows = sqlite.prepare('SELECT COUNT(*) as n FROM auth_tokens WHERE user_id IS NULL OR user_id = ?').all('nadie');
    sqlite.close();
    expect(rows[0].n).toBe(0);
  });

  it('email inválido → 400 VALIDATION_ERROR', async () => {
    const res = await forgot({ email: 'no-email' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('reset con token válido + password fuerte → 200 + password actualizado + token marcado como usado', async () => {
    // Genero el token directamente en DB para no depender del correo (no-op en test).
    const rawToken = 'z'.repeat(64);
    const tokenId = uuidv7();
    const now = Date.now();
    const sqlite = new Database(join(tmp, 't1.db'));
    drizzle(sqlite).insert(authTokens).values({
      id: tokenId, userId: 'u-ana', type: 'password_reset',
      tokenHash: hashToken(rawToken), expiresAt: now + 3600000, createdAt: now,
    }).run();
    sqlite.close();

    const res = await reset({ token: rawToken, password: PW });
    expect(res.statusCode).toBe(200);

    // Login con la password nueva funciona.
    const loginRes = await login({ email: 'ana@shop.com', password: PW });
    expect(loginRes.statusCode).toBe(200);

    // El token quedó marcado como usado.
    const sqlite2 = new Database(join(tmp, 't1.db'));
    const tok = sqlite2.prepare('SELECT used_at FROM auth_tokens WHERE id=?').get(tokenId);
    sqlite2.close();
    expect(tok.used_at).not.toBeNull();
  });

  it('reset con token ya usado → 401 INVALID_TOKEN (no se puede reusar)', async () => {
    // Reuso el token del test anterior.
    const rawToken = 'z'.repeat(64);
    const res = await reset({ token: rawToken, password: 'OtraNueva123' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_TOKEN');
  });

  it('reset con token inexistente → 401 INVALID_TOKEN', async () => {
    const res = await reset({ token: 'z'.repeat(64).replace(/z/g, 'a'), password: 'NuevoPass1234' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_TOKEN');
  });

  it('reset con token expirado → 401 INVALID_TOKEN', async () => {
    const rawExpired = 'e'.repeat(64);
    const now = Date.now();
    const sqlite = new Database(join(tmp, 't1.db'));
    drizzle(sqlite).insert(authTokens).values({
      id: uuidv7(), userId: 'u-ana', type: 'password_reset',
      tokenHash: hashToken(rawExpired), expiresAt: now - 1000, createdAt: now - 3600000,
    }).run();
    sqlite.close();

    const res = await reset({ token: rawExpired, password: 'NuevoPass1234' });
    expect(res.statusCode).toBe(401);
  });

  it('reset con password débil (<8) → 400 VALIDATION_ERROR', async () => {
    const res = await reset({ token: 'x'.repeat(64), password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('rutas en apex (sin tenant) → 404', async () => {
    const res1 = await app.inject({ method: 'POST', url: '/api/v1/auth/forgot-pass', payload: { email: 'x@x.com' } });
    expect(res1.statusCode).toBe(404);
    const res2 = await app.inject({ method: 'POST', url: '/api/v1/auth/reset-pass', payload: { token: 'x', password: 'MyPass1234' } });
    expect(res2.statusCode).toBe(404);
  });
});
