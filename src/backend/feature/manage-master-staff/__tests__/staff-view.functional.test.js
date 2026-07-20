import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants, platformUsers } from '../../../config/drizzle/schema-platform.js';
import { roles, tenantUsers, userRoles } from '../../../config/drizzle/schema-tenant.js';
import { createTenantOnboardingRepository } from '../../manage-platform-tenant/infrastructure/tenant-onboarding.repository.js';
import { makeRegisterTenantMaster } from '../../manage-platform-tenant/application/register-tenant-master.usecase.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

const SUPER_EMAIL = 'superadmin@baas.com';
const MASTER_EMAIL = 'master@tienda.com';
const STAFF_EMAIL = 'colaborador@tienda.com';
const PASSWORD = 'Password123';
const PASSPHRASE = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let superSid;
let masterSid;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-staffview-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();

  platformDb
    .insert(platformUsers)
    .values({
      id: 'sa-sv',
      email: SUPER_EMAIL,
      passwordHash: await hashSecret(PASSWORD),
      passphraseHash: await hashSecret(PASSPHRASE),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  platformDb
    .insert(tenants)
    .values([{ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }])
    .run();

  migrateTenant('t1');

  // Master (crea su rol master + usuario) + un colaborador staff con un rol dinámico.
  const sqlite = new Database(join(tmp, 't1.db'));
  const db = drizzle(sqlite);
  const reg = makeRegisterTenantMaster({ repository: createTenantOnboardingRepository({ db }) });
  const { rawToken } = await reg({ email: MASTER_EMAIL });

  db.insert(roles).values({ id: 'r-inv', name: 'inventory', category: 'staff', isReserved: 0, createdAt: now, updatedAt: now }).run();
  db.insert(tenantUsers).values({ id: 'u-staff', email: STAFF_EMAIL, status: 'active', createdAt: now, updatedAt: now }).run();
  db.insert(userRoles).values({ userId: 'u-staff', roleId: 'r-inv', assignedAt: now }).run();
  sqlite.close();

  app = await buildApp();

  // Activar Master con su token de invitación (define password/passphrase vía doble factor).
  await app.inject({
    method: 'POST',
    url: '/api-system/v1/login',
    headers: { host: 'tienda.localhost' },
    payload: { token: rawToken, password: PASSWORD, passphrase: PASSPHRASE },
  });

  const superLogin = await app.inject({
    method: 'POST',
    url: '/api-system/v1/login',
    payload: { email: SUPER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
  });
  superSid = superLogin.cookies.find((c) => c.name === 'platform_sid').value;

  const masterLogin = await app.inject({
    method: 'POST',
    url: '/api-system/v1/login',
    headers: { host: 'tienda.localhost' },
    payload: { email: MASTER_EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
  });
  masterSid = masterLogin.cookies.find((c) => c.name === 'tenant_sid')?.value;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('GET /dashboard/staff (SSR vista de Staff)', () => {
  it('sin cookie → 302 a /dashboard/login', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/staff', headers: { host: 'tienda.localhost' } });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('Superadmin (no master) → 302 a /dashboard', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/staff', cookies: { platform_sid: superSid } });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('Master → 200 con la página de staff y el colaborador listado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/staff',
      headers: { host: 'tienda.localhost' },
      cookies: { tenant_sid: masterSid },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    const html = res.body;
    expect(html).toContain('Mi equipo');
    expect(html).toContain('Colaboradores');
    expect(html).toContain(STAFF_EMAIL);
    expect(html).toContain('inventory');
    expect(html).toContain('c-sidebar__link--active'); // Staff resaltado en el menú
  });
});
