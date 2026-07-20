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
import { createTenantOnboardingRepository } from '../../manage-platform-tenant/infrastructure/tenant-onboarding.repository.js';
import { makeRegisterTenantMaster } from '../../manage-platform-tenant/application/register-tenant-master.usecase.js';
import { buildApp } from '../../../kernel/app.js';

const MASTER_EMAIL = 'master@tienda.com';
const PASSWORD = 'Password123';
const PASSPHRASE = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let rawToken;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-tauth-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb
    .insert(tenants)
    .values([
      { id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now },
      { id: 't2', subdomain: 'otra', status: 'active', createdAt: now, updatedAt: now },
    ])
    .run();
  migrateTenant('t1');
  migrateTenant('t2');

  // Sembrar el Master invited + token de activación en t1 (como haría create-tenant).
  const sqlite = new Database(join(tmp, 't1.db'));
  const reg = makeRegisterTenantMaster({ repository: createTenantOnboardingRepository({ db: drizzle(sqlite) }) });
  ({ rawToken } = await reg({ email: MASTER_EMAIL }));
  sqlite.close();

  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const onTienda = (opts) => app.inject({ headers: { host: 'tienda.localhost', ...(opts.headers ?? {}) }, ...opts });

describe('auth Master en su subdominio (funcional, contexto tenant)', () => {
  it('activación: el Master canjea su token y define credenciales → 200', async () => {
    const res = await onTienda({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { token: rawToken, password: PASSWORD, passphrase: PASSPHRASE },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: null });
  });

  it('login: tras activar, inicia sesión → 200 + cookie tenant_sid', async () => {
    const res = await onTienda({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { email: MASTER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().data.accessToken).toBe('string');
    expect(String(res.headers['set-cookie'])).toContain('tenant_sid=');
  });

  it('/me: con sesión de tenant → perfil con scope tenant y su tenantId', async () => {
    const login = await onTienda({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { email: MASTER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
    });
    const sid = login.cookies.find((c) => c.name === 'tenant_sid').value;

    const me = await onTienda({ method: 'GET', url: '/api-system/v1/me', cookies: { tenant_sid: sid } });
    expect(me.statusCode).toBe(200);
    expect(me.json().data).toMatchObject({ email: MASTER_EMAIL, scope: 'tenant', tenantId: 't1' });
  });

  it('anti cross-tenant: el access token de t1 NO sirve en otro subdominio → 401', async () => {
    const login = await onTienda({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { email: MASTER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
    });
    const token = login.json().data.accessToken;

    const res = await app.inject({
      method: 'GET',
      url: '/api-system/v1/me',
      headers: { host: 'otra.localhost', authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
