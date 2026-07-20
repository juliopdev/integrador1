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
import { roles as rolesTable, tenantUsers, userRoles } from '../../../config/drizzle/schema-tenant.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

// Suite consolidado (Iter consolidación 2026-07): antes 18 tests granulares con muchos "sin sesión
// → 401/302" repetidos. Ahora 10 tests: RBAC en tabla, feed público en un solo test que valida
// audience+ordering+limit+shape, y los CRUD de scheduled agrupados.

const HOST = 'shop.localhost';
const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let masterToken;
let userAccessToken;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-notifications-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  const db = drizzle(sqlite);

  db.insert(rolesTable).values({ id: 'r-master', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db.insert(tenantUsers).values({
    id: 'u-master', email: 'master@shop.com',
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db.insert(userRoles).values({ userId: 'u-master', roleId: 'r-master', assignedAt: now }).run();
  db.insert(tenantUsers).values({
    id: 'u-end', email: 'buyer@shop.com',
    passwordHash: await hashSecret(PW), authProvider: 'local',
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  sqlite.close();

  app = await buildApp();

  const masterLogin = await app.inject({
    method: 'POST', url: '/api-system/v1/login', headers: { host: HOST },
    payload: { email: 'master@shop.com', password: PW, passphrase: PP },
  });
  masterToken = masterLogin.json().data.accessToken;

  const userLogin = await app.inject({
    method: 'POST', url: '/api/v1/auth/login', headers: { host: HOST },
    payload: { email: 'buyer@shop.com', password: PW },
  });
  userAccessToken = userLogin.json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const post = (payload, headers = {}) =>
  app.inject({ method: 'POST', url: '/api-system/v1/notifications', headers: { host: HOST, ...headers }, payload });
const feed = (query = '', headers = {}) =>
  app.inject({ method: 'GET', url: `/api/v1/notifications${query}`, headers: { host: HOST, ...headers } });
const asMaster = (method, url, payload) =>
  app.inject({ method, url, headers: { host: HOST, authorization: `Bearer ${masterToken}` }, ...(payload ? { payload } : {}) });

describe('tenant-notifications — publicar + scheduled + feed + SSR', () => {
  // ─── RBAC / validation en POST publicar ─────────────────────────────────
  it('POST publicar: sin sesión 401; body inválido 400; audience segment (fuera de Slice 1) 400', async () => {
    const anon = await post({ title: 'Hola', body: 'Mundo' });
    expect(anon.statusCode).toBe(401);

    const invalid = await post({ title: '', body: 'x' }, { authorization: `Bearer ${masterToken}` });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().code).toBe('VALIDATION_ERROR');

    const segment = await post({ title: 'x', body: 'y', audience: 'segment' }, { authorization: `Bearer ${masterToken}` });
    expect(segment.statusCode).toBe(400);
  });

  it('POST publicar Master → 201 con shape público (uuidv7, sin createdBy)', async () => {
    const res = await post({ title: 'Nueva colección', body: 'Descubrí las novedades.' }, { authorization: `Bearer ${masterToken}` });
    expect(res.statusCode).toBe(201);
    const created = res.json().data;
    expect(created.title).toBe('Nueva colección');
    expect(created.audience).toBe('public');
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(created).not.toHaveProperty('createdBy');
  });

  // ─── Feed público: audience + orden + limit + shape en 1 test ──────────
  it('GET feed: audience gate (anon ≠ auth), orden DESC por publishedAt, limit clampado a 100, shape público', async () => {
    await post({ title: 'Público', body: 'Todos.', audience: 'public' }, { authorization: `Bearer ${masterToken}` });
    await post({ title: 'Sólo auth', body: 'Registrados.', audience: 'authenticated' }, { authorization: `Bearer ${masterToken}` });

    const anon = await feed();
    expect(anon.statusCode).toBe(200);
    const anonTitles = anon.json().data.map((n) => n.title);
    expect(anonTitles).toContain('Público');
    expect(anonTitles).not.toContain('Sólo auth');

    const auth = await feed('', { authorization: `Bearer ${userAccessToken}` });
    const authTitles = auth.json().data.map((n) => n.title);
    expect(authTitles).toContain('Público');
    expect(authTitles).toContain('Sólo auth');

    // Orden DESC por publishedAt.
    const list = anon.json().data;
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].publishedAt).toBeGreaterThanOrEqual(list[i].publishedAt);
    }

    // Limit clampado en el use case.
    const clamp = await feed('?limit=200');
    expect(clamp.json().data.length).toBeLessThanOrEqual(100);

    // Shape público: nunca expone createdBy/status/scheduledAt.
    const item = list[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('body');
    expect(item).toHaveProperty('audience');
    expect(item).toHaveProperty('publishedAt');
    expect(item).not.toHaveProperty('createdBy');
    expect(item).not.toHaveProperty('status');
    expect(item).not.toHaveProperty('scheduledAt');
  });

  // ─── Scheduled: crear + validación de fecha ────────────────────────────
  it('scheduledAt futuro → 201 status=scheduled + no aparece en feed público; en el pasado → 422', async () => {
    const future = Date.now() + 60_000;
    const ok = await post({ title: 'Programado', body: 'B', scheduledAt: future }, { authorization: `Bearer ${masterToken}` });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().data.status).toBe('scheduled');
    expect(ok.json().data.scheduledAt).toBe(future);
    expect(ok.json().data.publishedAt).toBeUndefined();

    const anonTitles = (await feed()).json().data.map((n) => n.title);
    expect(anonTitles).not.toContain('Programado');

    const past = await post({ title: 'x', body: 'y', scheduledAt: Date.now() - 1000 }, { authorization: `Bearer ${masterToken}` });
    expect(past.statusCode).toBe(422);
    expect(past.json().code).toBe('VALIDATION_ERROR');
  });

  // ─── Scheduled: listar (RBAC + orden + shape interno) ───────────────────
  it('GET scheduled: sin sesión 401; Master 200 ordenado ASC con shape interno (createdBy visible)', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api-system/v1/notifications/scheduled', headers: { host: HOST } });
    expect(anon.statusCode).toBe(401);

    const res = await asMaster('GET', '/api-system/v1/notifications/scheduled');
    expect(res.statusCode).toBe(200);
    const list = res.json().data;
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].scheduledAt).toBeLessThanOrEqual(list[i].scheduledAt);
    }
    if (list.length > 0) {
      expect(list[0]).toHaveProperty('scheduledAt');
      expect(list[0]).toHaveProperty('createdBy');
    }
  });

  // ─── Scheduled: PUT edit ───────────────────────────────────────────────
  it('PUT scheduled: happy path actualiza título; id inexistente → 404 NOTIFICATION_NOT_FOUND', async () => {
    const future = Date.now() + 5 * 60_000;
    const created = await post({ title: 'Original', body: 'B', scheduledAt: future }, { authorization: `Bearer ${masterToken}` });
    const { id } = created.json().data;

    const edit = await asMaster('PUT', `/api-system/v1/notifications/scheduled/${id}`, { title: 'Editado' });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().data.title).toBe('Editado');

    const nf = await asMaster('PUT', '/api-system/v1/notifications/scheduled/does-not-exist', { title: 'x' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json().code).toBe('NOTIFICATION_NOT_FOUND');
  });

  // ─── Scheduled: DELETE cancel (idempotencia) ───────────────────────────
  it('DELETE scheduled: cancela → 200 { id, canceled: true }; segundo intento → 404', async () => {
    const future = Date.now() + 10 * 60_000;
    const created = await post({ title: 'Cancelable', body: 'B', scheduledAt: future }, { authorization: `Bearer ${masterToken}` });
    const { id } = created.json().data;

    const del = await asMaster('DELETE', `/api-system/v1/notifications/scheduled/${id}`);
    expect(del.statusCode).toBe(200);
    expect(del.json().data).toEqual({ id, canceled: true });

    const replay = await asMaster('DELETE', `/api-system/v1/notifications/scheduled/${id}`);
    expect(replay.statusCode).toBe(404);
  });

  // ─── SSR /dashboard/notifications ───────────────────────────────────────
  it('SSR: sin sesión 302; Master 200 con form compose + tabla programadas + sidebar activePath', async () => {
    const anon = await app.inject({ method: 'GET', url: '/dashboard/notifications', headers: { host: HOST } });
    expect(anon.statusCode).toBe(302);
    expect(anon.headers.location).toBe('/dashboard/login');

    const res = await asMaster('GET', '/dashboard/notifications');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Avisos a tus clientes');
    expect(res.body).toContain('action="/api-system/v1/notifications"');
    expect(res.body).toContain('name="title"');
    expect(res.body).toContain('name="body"');
    expect(res.body).toContain('name="audience"');
    expect(res.body).toContain('name="scheduledAt"');
    expect(res.body).toContain('type="datetime-local"');
    expect(res.body).toMatch(/href="\/dashboard\/notifications"[^>]*class="[^"]*c-sidebar__link--active/);
  });

  // ─── Coerce datetime-local (Form SSR → epoch ms) ──────────────────────
  it('POST acepta scheduledAt como string ISO (`YYYY-MM-DDTHH:mm` del input datetime-local) y persiste ms', async () => {
    const iso = new Date(Date.now() + 90_000).toISOString().slice(0, 16);
    const res = await post({ title: 'ISO', body: 'B', scheduledAt: iso }, { authorization: `Bearer ${masterToken}` });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe('scheduled');
    expect(typeof res.json().data.scheduledAt).toBe('number');
  });
});
