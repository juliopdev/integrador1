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
import { createSession } from '../../../infrastructure/providers/session.adapter.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

// Regresión de aislamiento de scope: en un subdominio conviven `tenant_sid` (admin Master/Staff) y
// `user_sid` (end-user headless). El panel admin (`/dashboard`) NO debe resolver la identidad de un
// end-user. Antes, tras el logout del admin (se borra `tenant_sid`), una cookie `user_sid` remanente
// se resolvía como `request.user` scope 'user' → 403 "ámbito desconocido". Debe ir a login.

const MASTER_EMAIL = 'master@tienda.com';
const PASSWORD = 'Password123';
const PASSPHRASE = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let masterSid;
let endUserSid;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-scope-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values([
    { id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now },
  ]).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  const reg = makeRegisterTenantMaster({ repository: createTenantOnboardingRepository({ db: drizzle(sqlite) }) });
  const { rawToken } = await reg({ email: MASTER_EMAIL });
  sqlite.close();

  app = await buildApp();

  // Activar + loguear al Master → `tenant_sid` (scope tenant, superficie admin válida).
  await app.inject({
    method: 'POST', url: '/api-system/v1/login', headers: { host: 'tienda.localhost' },
    payload: { token: rawToken, password: PASSWORD, passphrase: PASSPHRASE },
  });
  const masterLogin = await app.inject({
    method: 'POST', url: '/api-system/v1/login', headers: { host: 'tienda.localhost' },
    payload: { email: MASTER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
  });
  masterSid = masterLogin.cookies.find((c) => c.name === 'tenant_sid').value;

  // Sesión de end-user (scope 'user') en el MISMO tenant — simula la cookie remanente.
  endUserSid = await createSession({ userId: 'u-enduser', email: 'jp.enduser@gmail.com', scope: 'user', tenantId: 't1' });
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('Aislamiento de scope en la superficie admin (/dashboard)', () => {
  it('cookie `user_sid` (end-user) en /dashboard del subdominio → 302 a login, NO 403', async () => {
    const res = await app.inject({
      method: 'GET', url: '/dashboard',
      headers: { host: 'tienda.localhost' },
      cookies: { user_sid: endUserSid },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('escenario reportado: sin `tenant_sid` pero con `user_sid` remanente → login (no queda pegado en 403)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/dashboard/',
      headers: { host: 'tienda.localhost' },
      cookies: { user_sid: endUserSid },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('el admin (Master, `tenant_sid`) sigue entrando normal → 200', async () => {
    const res = await app.inject({
      method: 'GET', url: '/dashboard',
      headers: { host: 'tienda.localhost' },
      cookies: { tenant_sid: masterSid },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('coexistencia: con ambas cookies, /dashboard resuelve al admin (tenant_sid), ignora user_sid', async () => {
    const res = await app.inject({
      method: 'GET', url: '/dashboard',
      headers: { host: 'tienda.localhost' },
      cookies: { tenant_sid: masterSid, user_sid: endUserSid },
    });
    expect(res.statusCode).toBe(200);
  });
});
