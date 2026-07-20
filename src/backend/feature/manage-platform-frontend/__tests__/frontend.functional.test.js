/**
 * Pruebas funcionales del feature manage-platform-frontend.
 * Cubre: RBAC (solo Superadmin), CRUD de deploys externos con validación
 * de URL (HTTPS, sin puerto), SSR views con tabs (Iter 55) y
 * redirect de modo externo a nivel de app.
 *
 * @module ManagePlatformFrontendFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers, tenants as tenantsTable } from '../../../config/drizzle/schema-platform.js';
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
  tmp = mkdtempSync(join(tmpdir(), 'baas-frontend-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();

  // Superadmin activo en platform.db.
  platformDb.insert(platformUsers).values({
    id: 'sa', email: SA_EMAIL,
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    createdAt: now, updatedAt: now,
  }).run();

  // Dos tenants: 'shop' (con Master), 'blog' (sin deploy).
  platformDb.insert(tenantsTable).values([
    { id: 't-shop', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now },
    { id: 't-blog', subdomain: 'blog', status: 'active', createdAt: now, updatedAt: now },
  ]).run();
  migrateTenant('t-shop');

  // Master del tenant 'shop' para el test de RBAC (403).
  const sqlite = new Database(join(tmp, 't-shop.db'));
  const db = drizzle(sqlite);
  db.insert(rolesTable).values({ id: 'r-m', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db.insert(tenantUsers).values({
    id: 'u-master', email: MASTER_EMAIL,
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db.insert(userRoles).values({ userId: 'u-master', roleId: 'r-m', assignedAt: now }).run();
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

/**
 * Helper: PUT request con payload.
 * @param {string} url
 * @param {Object} payload
 * @param {Object} [headers]
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const put = (url, payload, headers = {}) => app.inject({ method: 'PUT', url, headers, payload });
/**
 * Helper: DELETE request.
 * @param {string} url
 * @param {Object} [headers]
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const del = (url, headers = {}) => app.inject({ method: 'DELETE', url, headers });
/**
 * Helper: GET request.
 * @param {string} url
 * @param {Object} [headers]
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const get = (url, headers = {}) => app.inject({ method: 'GET', url, headers });

describe('RBAC — sólo Superadmin (scope=platform)', () => {
  it('sin sesión → GET list 403', async () => {
    const res = await get('/api-system/v1/frontends');
    expect(res.statusCode).toBe(403);
  });

  it('Master del tenant → PUT external 403 (aún con Bearer válido de tenant)', async () => {
    const res = await put('/api-system/v1/frontends/t-shop/external',
      { externalUrl: 'https://mitienda.com/' },
      { host: SHOP_HOST, authorization: `Bearer ${masterToken}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('Master del tenant → DELETE 403', async () => {
    const res = await del('/api-system/v1/frontends/t-shop',
      { host: SHOP_HOST, authorization: `Bearer ${masterToken}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('CRUD (Superadmin)', () => {
  it('GET /api-system/v1/frontends lista todos los tenants (con y sin deploy)', async () => {
    const res = await get('/api-system/v1/frontends', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    const list = res.json().data;
    const shop = list.find((r) => r.subdomain === 'shop');
    const blog = list.find((r) => r.subdomain === 'blog');
    expect(shop).toBeDefined();
    expect(blog).toBeDefined();
    // Ninguno tiene deploy todavía.
    expect(shop.deploy).toBeNull();
    expect(blog.deploy).toBeNull();
  });

  it('PUT external con URL HTTPS válida → 200 con mode=external, aparece en el GET siguiente', async () => {
    const res = await put('/api-system/v1/frontends/t-shop/external',
      { externalUrl: 'https://mitienda.com/' },
      { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.mode).toBe('external');
    expect(res.json().data.externalUrl).toBe('https://mitienda.com/');

    // El GET siguiente refleja el deploy.
    const list = await get('/api-system/v1/frontends', { authorization: `Bearer ${superToken}` });
    const shop = list.json().data.find((r) => r.subdomain === 'shop');
    expect(shop.deploy).toMatchObject({ mode: 'external', externalUrl: 'https://mitienda.com/' });
  });

  it('PUT external con HTTP → 422 INSECURE_URL (no persiste)', async () => {
    const res = await put('/api-system/v1/frontends/t-blog/external',
      { externalUrl: 'http://miblog.com/' },
      { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INSECURE_URL');
  });

  it('PUT external con puerto :8080 → 422 VALIDATION_ERROR', async () => {
    const res = await put('/api-system/v1/frontends/t-blog/external',
      { externalUrl: 'https://miblog.com:8080/' },
      { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('PUT external sobre un tenant que ya tiene deploy → upsert (mismo tenantId, otro externalUrl)', async () => {
    const res = await put('/api-system/v1/frontends/t-shop/external',
      { externalUrl: 'https://otro.com/' },
      { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.externalUrl).toBe('https://otro.com/');

    const list = await get('/api-system/v1/frontends', { authorization: `Bearer ${superToken}` });
    const shops = list.json().data.filter((r) => r.subdomain === 'shop');
    expect(shops).toHaveLength(1); // sigue habiendo UN solo registro
    expect(shops[0].deploy.externalUrl).toBe('https://otro.com/');
  });

  // NOTA: el flujo end-to-end de PUT /hosted (multipart + extracción ZIP/RAR + inyección de env)
  // vive en `set-hosted-deploy.usecase.unit.test.js` con extracción mockeada. Un funcional real
  // requeriría crear un ZIP válido cross-plataforma (GNU tar no soporta -acf .zip), fixture
  // binaria en el repo, o dependencia adicional — el ROI no lo justifica cuando el use case
  // ya cubre la lógica y RBAC + otros modos están cubiertos aquí.

  it('DELETE → 200 { deleted: true }; segundo → 404 DEPLOY_NOT_FOUND', async () => {
    const res = await del('/api-system/v1/frontends/t-shop', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ tenantId: 't-shop', deleted: true });

    const replay = await del('/api-system/v1/frontends/t-shop', { authorization: `Bearer ${superToken}` });
    expect(replay.statusCode).toBe(404);
    expect(replay.json().code).toBe('DEPLOY_NOT_FOUND');
  });

  it('DELETE tenant inexistente → 404 TENANT_NOT_FOUND', async () => {
    const res = await del('/api-system/v1/frontends/does-not-exist', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('TENANT_NOT_FOUND');
  });
});

describe('SSR views (Superadmin)', () => {
  it('GET /dashboard/frontends sin sesión → redirect a /dashboard/login', async () => {
    const res = await get('/dashboard/frontends');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('GET /dashboard/frontends con Superadmin → 200 con tabla y links de configuración', async () => {
    const res = await get('/dashboard/frontends', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Frontends de los tenants');
    expect(res.body).toContain('href="/dashboard/frontends/t-shop"');
    expect(res.body).toContain('href="/dashboard/frontends/t-blog"');
    // Sidebar resalta "Frontends".
    expect(res.body).toMatch(/href="\/dashboard\/frontends"[^>]*class="[^"]*c-sidebar__link--active/);
  });

  it('GET /dashboard/frontends/:tenantId con Superadmin → form al endpoint PUT external + tabs Iter 55', async () => {
    const res = await get('/dashboard/frontends/t-blog', { authorization: `Bearer ${superToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('action="/api-system/v1/frontends/t-blog/external"');
    expect(res.body).toContain('name="externalUrl"');
    expect(res.body).toContain('type="url"');

    // Iter 55: tabs Externo + Hospedado (sin deploy → sin tab de zona peligrosa).
    expect(res.body).toContain('data-target-panel="fe-external"');
    expect(res.body).toContain('data-target-panel="fe-hosted"');
    expect(res.body).not.toContain('data-target-panel="fe-danger"');
    // Externo por defecto activo cuando no hay deploy. En `tabs/ui.ejs` `class` está antes del
    // `data-target-panel`, así que buscamos ese orden.
    expect(res.body).toMatch(/c-tabs__tab--active[\s\S]{0,200}data-target-panel="fe-external"/);
  });

  it('GET /dashboard/frontends/:tenantId con Master → redirect a /dashboard (feature exclusiva SA)', async () => {
    const res = await get('/dashboard/frontends/t-shop', { host: SHOP_HOST, authorization: `Bearer ${masterToken}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });
});

describe('Redirect de modo externo (fallback a nivel de app)', () => {
  const EXTERNAL = 'https://model-earth.netlify.app/login';

  it('configura external en blog e invalida cache; navegar al subdominio raíz → 302 a la URL externa', async () => {
    const put1 = await put('/api-system/v1/frontends/t-blog/external',
      { externalUrl: EXTERNAL }, { authorization: `Bearer ${superToken}` });
    expect(put1.statusCode).toBe(200);

    const res = await get('/', { host: 'blog.localhost' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(EXTERNAL);
  });

  it('NO redirige las rutas de sistema del subdominio (la API del tenant sigue viva)', async () => {
    const res = await get('/api/v1/cualquier-cosa', { host: 'blog.localhost' });
    expect(res.statusCode).not.toBe(302);
  });
});
