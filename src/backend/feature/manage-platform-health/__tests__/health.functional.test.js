import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers, tenants as tenantsTable, platformLogsLocal } from '../../../config/drizzle/schema-platform.js';
import { roles as rolesTable, tenantUsers, userRoles } from '../../../config/drizzle/schema-tenant.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

const SA_EMAIL = 'super@baas.com';
const MASTER_EMAIL = 'master@shop.com';
const PW = 'Password123';
const PP = 'frase de paso larga';
const SHOP_HOST = 'shop.localhost';

let app;
let tmp;
let originalDir;
let superToken;
let masterToken;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-fase7-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();

  platformDb.insert(platformUsers).values({
    id: 'sa', email: SA_EMAIL,
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    createdAt: now, updatedAt: now,
  }).run();

  platformDb.insert(tenantsTable).values([
    { id: 't-shop', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now },
  ]).run();
  migrateTenant('t-shop');

  // Seed logs con distintos niveles para verificar filtros y counts.
  platformDb.insert(platformLogsLocal).values([
    { id: 'l1', level: 'info', message: 'server started', metadataJson: null, createdAt: now - 3000 },
    { id: 'l2', level: 'warn', message: 'rate limit near', metadataJson: '{"ip":"1.2.3.4"}', createdAt: now - 2000 },
    { id: 'l3', level: 'error', message: 'boom', metadataJson: null, createdAt: now - 1000 },
  ]).run();

  // Master del tenant 'shop' para verificar 403.
  const sqlite = new Database(join(tmp, 't-shop.db'));
  const db = drizzle(sqlite);
  db.insert(rolesTable).values({ id: 'r-m', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db.insert(tenantUsers).values({
    id: 'u-m', email: MASTER_EMAIL,
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db.insert(userRoles).values({ userId: 'u-m', roleId: 'r-m', assignedAt: now }).run();
  sqlite.close();

  app = await buildApp();
  const saLogin = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    payload: { email: SA_EMAIL, password: PW, passphrase: PP },
  });
  superToken = saLogin.json().data.accessToken;

  const masterLogin = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    headers: { host: SHOP_HOST },
    payload: { email: MASTER_EMAIL, password: PW, passphrase: PP },
  });
  masterToken = masterLogin.json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const get = (url, headers = {}) => app.inject({ method: 'GET', url, headers });

describe('Health — API + SSR (Superadmin-only)', () => {
  it('GET /api-system/v1/health/platform sin sesión → 403', async () => {
    const res = await get('/api-system/v1/health/platform');
    expect(res.statusCode).toBe(403);
  });

  it('GET /api-system/v1/health/platform con Master → 403 (aún con token válido de tenant)', async () => {
    const res = await get('/api-system/v1/health/platform', { host: SHOP_HOST, authorization: `Bearer ${masterToken}` });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api-system/v1/health/platform con Superadmin → 200 con snapshot completo', async () => {
    const res = await get('/api-system/v1/health/platform', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.system).toHaveProperty('nodeVersion');
    expect(d.platform.tenants.active).toBeGreaterThan(0);
    expect(d.platform.superadmins).toBeGreaterThan(0);
    expect(d.storage).toHaveProperty('platformDb');
  });

  it('GET /dashboard/health sin sesión → redirect a login', async () => {
    const res = await get('/dashboard/health');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('GET /dashboard/health con Master → redirect a /dashboard (feature Superadmin)', async () => {
    const res = await get('/dashboard/health', { host: SHOP_HOST, authorization: `Bearer ${masterToken}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('GET /dashboard/health con Superadmin → 200 con tabs Sistema/Almacenamiento/Actividad (Iter 55)', async () => {
    const res = await get('/dashboard/health', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Health de la plataforma');
    expect(res.body).toContain('data-refresh-seconds="30"');

    // Iter 55: los 3 tabs presentes con sus data-target-panel.
    expect(res.body).toContain('data-target-panel="health-system"');
    expect(res.body).toContain('data-target-panel="health-storage"');
    expect(res.body).toContain('data-target-panel="health-jobs"');

    // Cada panel presente con data-tab-panel + role tabpanel.
    expect(res.body).toMatch(/id="health-system"[^>]*data-tab-panel="health-system"/);
    expect(res.body).toMatch(/id="health-storage"[^>]*data-tab-panel="health-storage"/);
    expect(res.body).toMatch(/id="health-jobs"[^>]*data-tab-panel="health-jobs"/);

    // Sistema por default activo (server-side). En `tabs/ui.ejs` el atributo `class` viene
    // ANTES del `data-target-panel`, así que buscamos ese orden.
    expect(res.body).toMatch(/c-tabs__tab--active[\s\S]{0,200}data-target-panel="health-system"/);

    // Contenidos: cards de cada tab siguen renderizando.
    expect(res.body).toContain('Sistema (VPS)');
    expect(res.body).toContain('Tenants activos');       // dentro del tab Almacenamiento
    expect(res.body).toContain('Cola de jobs');           // dentro del tab Actividad

    // Sidebar resalta "Health".
    expect(res.body).toMatch(/href="\/dashboard\/health"[^>]*class="[^"]*c-sidebar__link--active/);
  });
});

describe('Logs — SSR (Superadmin-only)', () => {
  it('GET /dashboard/logs sin sesión → redirect login', async () => {
    const res = await get('/dashboard/logs');
    expect(res.statusCode).toBe(302);
  });

  it('GET /dashboard/logs con Master → redirect /dashboard', async () => {
    const res = await get('/dashboard/logs', { host: SHOP_HOST, authorization: `Bearer ${masterToken}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('GET /dashboard/logs con Superadmin → 200 con los 3 logs y counts', async () => {
    const res = await get('/dashboard/logs', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Logs de la plataforma');
    expect(res.body).toContain('server started');
    expect(res.body).toContain('boom');
    expect(res.body).toContain('1.2.3.4'); // metadata parseada
    // Iter UX: filtros como tabs con contador en badge separado (label + badge, ya no `Label · N`).
    // Verificamos que aparezcan el label y el count del badge del nivel correspondiente.
    expect(res.body).toMatch(/c-tabs__tab[^>]*>\s*Error\s*<span[^>]*c-badge--danger[^>]*>\d+</);
    expect(res.body).toMatch(/c-tabs__tab[^>]*>\s*Warn\s*<span[^>]*c-badge--warning[^>]*>\d+</);
  });

  it('?level=error → sólo el log de error', async () => {
    const res = await get('/dashboard/logs?level=error', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('boom');
    expect(res.body).not.toContain('server started');
  });
});
