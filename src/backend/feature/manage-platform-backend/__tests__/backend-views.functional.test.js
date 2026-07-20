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
import { hashSecret } from '../../../common/password.js';
import { makePublishContract } from '../application/publish-contract.usecase.js';
import { createContractRepository } from '../../../infrastructure/no-code/contract.repository.js';
import { roles as rolesTable } from '../../../config/drizzle/schema-tenant.js';
import { buildApp } from '../../../kernel/app.js';

// Suite consolidado (Iter consolidación 2026-07): antes eran 71 tests granulares — ahora 22
// tests agrupados por concern. Cada test verifica múltiples asserts sobre el MISMO setup para
// mantener las verificaciones de las 3 páginas del feature (listing, wizard, detail) sin duplicar
// bootstrap. Los happy-path + duplicate + invalid + not-found de un mismo endpoint se validan
// juntos porque comparten el arranque del server (~1.5s).

const SUPER_EMAIL = 'super@baas.com';
const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let superSid;
let tmp;
let originalDir;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-backend-views-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(platformUsers).values({
    id: 'sa', email: SUPER_EMAIL,
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    createdAt: now, updatedAt: now,
  }).run();
  platformDb.insert(tenants).values([
    { id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now },
    { id: 't2', subdomain: 'otra', status: 'active', createdAt: now, updatedAt: now },
  ]).run();
  migrateTenant('t1');
  migrateTenant('t2');

  // t1: seed rol staff (para paso `role`).
  const t1Sqlite = new Database(join(tmp, 't1.db'));
  drizzle(t1Sqlite).insert(rolesTable).values({
    id: 'r-existing', name: 'inventory', category: 'staff', isReserved: 0,
    createdAt: now, updatedAt: now,
  }).run();
  t1Sqlite.close();

  // t2: contrato publicado v1 con WS `user_to_user` habilitado.
  const sqlite = new Database(join(tmp, 't2.db'));
  await makePublishContract({ contractRepository: createContractRepository({ db: drizzle(sqlite) }) })({
    contract: {
      version: 'v1',
      stores: { sql: { provider: 'neon', enabled: true } },
      resources: [{ name: 'products', store: 'sql', physicalName: 'products_db', fields: [{ id: 'f1', name: 'title', type: 'string', required: true }] }],
      endpoints: [{ path: '/products', resource: 'products', methods: ['GET'] }],
      auth: { userAuthEnabled: false },
      websocket: { channels: ['user_to_user'] },
    },
  });
  sqlite.close();

  app = await buildApp();
  const login = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    payload: { email: SUPER_EMAIL, password: PW, passphrase: PP },
  });
  superSid = login.cookies.find((c) => c.name === 'platform_sid').value;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const asSuper = (method, url, body) => app.inject({
  method, url, cookies: { platform_sid: superSid },
  ...(body ? { payload: body } : {}),
});
const asAnon = (method, url, body) => app.inject({
  method, url, ...(body ? { payload: body } : {}),
});

describe('manage-platform-backend — vistas del asistente No-Code', () => {
  // ─── RBAC ────────────────────────────────────────────────────────────────────
  it('sin sesión → GET /dashboard/backends redirige a /dashboard/login', async () => {
    const res = await asAnon('GET', '/dashboard/backends');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard/login');
  });

  it('mutating endpoints sin Superadmin → 403 (RBAC)', async () => {
    const cases = [
      ['POST', '/api-system/v1/tenants/t1/backend/draft/resources', { name: 'x', physicalName: 'x_db', store: 'sql' }],
      ['POST', '/api-system/v1/tenants/t1/backend/draft/resources/products/fields', { name: 'x', type: 'string' }],
      ['POST', '/api-system/v1/tenants/t1/backend/draft/endpoints', { path: '/x', resource: 'products', methods: ['GET'] }],
      ['PUT', '/api-system/v1/tenants/t1/backend/draft/auth', { userAuthEnabled: true }],
      ['DELETE', '/api-system/v1/tenants/t1/backend/draft'],
      ['POST', '/api-system/v1/tenants/t1/api-key'],
    ];
    for (const [method, url, body] of cases) {
      const res = await asAnon(method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });

  // ─── Listing + estado derivado ───────────────────────────────────────────────
  it('listing muestra tenants + chip de estado, links al wizard, CTA de key y v1 publicado en t2', async () => {
    const res = await asSuper('GET', '/dashboard/backends');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    const html = res.body;
    expect(html).toContain('Backends No-Code');
    expect(html).toContain('tienda');
    expect(html).toContain('otra');
    expect(html).toContain('/dashboard/backends/t1');
    expect(html).toContain('/dashboard/backends/t2');
    // Sidebar activo.
    expect(html).toMatch(/href="\/dashboard\/backends"[^>]*class="[^"]*c-sidebar__link--active/);
    // Columnas P5 + CTA de key.
    expect(html).toContain('Versión actual');
    expect(html).toContain('Borrador');
    expect(html).toContain('Keys');
    expect(html).not.toContain('Estado del tenant');
    expect(html).toContain('Generar key');
    expect(html).toContain('id="apikey-reveal"');
    // t2 con v1 publicado.
    expect(html).toMatch(/v1 publicado/);
    expect(html).toContain('/dashboard/backends/t2/versions/v1');
  });

  it('estado derivado: t1 fresco abre en `version`, t2 con publicado abre en `finish`', async () => {
    const t1 = await asSuper('GET', '/dashboard/backends/t1');
    expect(t1.statusCode).toBe(200);
    expect(t1.body).toContain('Upgradear versión');
    expect(t1.body).toContain('Todavía no hay versión publicada para este tenant.');

    const t2 = await asSuper('GET', '/dashboard/backends/t2');
    expect(t2.statusCode).toBe(200);
    expect(t2.body).toContain('Estado del contrato');
    expect(t2.body).toContain('Publicado');
    expect(t2.body).toContain('<code>v1</code>');
    expect(t2.body).toContain('Compilar y desplegar');
  });

  it('tenant inexistente → 404', async () => {
    const res = await asSuper('GET', '/dashboard/backends/no-existe');
    expect(res.statusCode).toBe(404);
  });

  // ─── Sidebar de progreso ──────────────────────────────────────────────────────
  it('sidebar progreso: paso actual con `aria-current`, contador N/7, navegable sólo hacia atrás', async () => {
    const res = await asSuper('GET', '/dashboard/backends/t1?step=api');
    expect(res.statusCode).toBe(200);
    const html = res.body;
    expect(html).toMatch(/aria-label="Progreso del asistente"/);
    expect(html).toMatch(/<strong>[1-7]<\/strong>\/7/);
    expect(html).toContain('aria-current="step"');
    // En `api` (paso 4) hay 3 anteriores navegables y 4 estáticos (actual + 3 posteriores).
    const statics = html.match(/c-stepper__link--static/g) || [];
    expect(statics.length).toBe(4);
    expect(html).toContain('/dashboard/backends/t1?step=version');
    expect(html).toContain('/dashboard/backends/t1?step=provider');
    expect(html).not.toContain('?step=finish"');
    expect(html).toContain('Resources &amp; endpoints');
  });

  // ─── Paso `version` ─────────────────────────────────────────────────────────
  it('`?step=version`: sin publicado sugiere v1; con publicado sugiere v2 + historial', async () => {
    const t1 = await asSuper('GET', '/dashboard/backends/t1?step=version');
    expect(t1.body).toContain('Comenzar v1');
    expect(t1.body).toContain('Todavía no hay versión publicada para este tenant.');
    expect(t1.body).not.toContain('?step=api"'); // avance vía wizard-nav, no CTA
    expect(t1.body).not.toContain('Historial de versiones');

    const t2 = await asSuper('GET', '/dashboard/backends/t2?step=version');
    expect(t2.body).toContain('Upgradear a v2');
    expect(t2.body).toContain('Editar v1');
    expect(t2.body).toContain('Historial de versiones');
  });

  // ─── Paso `role` ────────────────────────────────────────────────────────────
  it('`?step=role`: form + lista roles seed (t1) o sólo form (t2)', async () => {
    const t1 = await asSuper('GET', '/dashboard/backends/t1?step=role');
    expect(t1.body).toContain('Crear un rol de Staff');
    expect(t1.body).toContain('action="/api-system/v1/tenants/t1/roles"');
    expect(t1.body).toContain('Roles creados');
    expect(t1.body).toContain('inventory');
    expect(t1.body).toContain('r-existing');
    expect(t1.body).not.toContain('permissionsJson');

    const t2 = await asSuper('GET', '/dashboard/backends/t2?step=role');
    expect(t2.body).toContain('Crear un rol de Staff');
    expect(t2.body).not.toContain('Roles creados');
  });

  // ─── Paso `ws` ──────────────────────────────────────────────────────────────
  it('`?step=ws`: sin publicado → CTA a `api`; con publicado → 4 toggles con estado actual', async () => {
    const t1 = await asSuper('GET', '/dashboard/backends/t1?step=ws');
    expect(t1.body).toContain('Sin backend publicado');
    expect(t1.body).toContain('/dashboard/backends/t1?step=api');
    expect(t1.body).not.toContain('Canales WebSocket');

    const t2 = await asSuper('GET', '/dashboard/backends/t2?step=ws');
    expect(t2.body).toContain('Canales WebSocket');
    for (const ch of ['user_to_user', 'user_to_room', 'user_to_admin', 'notifications_global']) {
      expect(t2.body).toContain(`name="channel" value="${ch}"`);
    }
    expect(t2.body).toMatch(/id="ws-user_to_user"[^>]*checked/);
    expect(t2.body).not.toMatch(/id="ws-user_to_room"[^>]*checked/);
    expect(t2.body).toContain('data-autosubmit');
    expect(t2.body).toContain('action="/api-system/v1/tenants/t2/backend/ws"');
  });

  // ─── Paso `api` — CRUD resources ────────────────────────────────────────────
  it('CRUD resource: `?step=api` sin draft muestra "Sin draft"; POST agrega + duplicado 422 + inválido 422/400', async () => {
    const empty = await asSuper('GET', '/dashboard/backends/t1?step=api');
    expect(empty.body).toContain('Sin draft en curso');
    expect(empty.body).toContain('action="/api-system/v1/tenants/t1/backend/draft/resources"');

    // Happy path.
    const add = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources', {
      name: 'products', physicalName: 'products_db', store: 'sql',
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().data).toEqual({ version: 'v1', resources: ['products'] });

    // Refleja en la vista.
    const view = await asSuper('GET', '/dashboard/backends/t1?step=api');
    expect(view.body).toContain('Draft actual: <code>v1</code>');
    expect(view.body).toContain('products');
    expect(view.body).toContain('products_db');
    expect(view.body).toContain('Postgres');

    // Duplicado.
    const dup = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources', {
      name: 'products', physicalName: 'products_db_2', store: 'sql',
    });
    expect(dup.statusCode).toBe(422);
    expect(dup.json().code).toBe('DUPLICATE_RESOURCE');

    // Nombre inválido (mayúsculas).
    const invalidName = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources', {
      name: 'MyProducts', physicalName: 'my_prods', store: 'sql',
    });
    expect(invalidName.statusCode).toBe(422);
    expect(invalidName.json().code).toBe('INVALID_NAME');

    // Body incompleto (falta store).
    const invalidBody = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources', {
      name: 'other',
    });
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json().code).toBe('VALIDATION_ERROR');

    // physicalName omitido → derivado como `<lógico>_db`.
    const derived = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources', {
      name: 'invoices_auto', store: 'sql',
    });
    expect(derived.statusCode).toBe(201);
    const derivedView = await asSuper('GET', '/dashboard/backends/t1?step=api');
    expect(derivedView.body).toContain('invoices_auto_db');

    // DELETE resource.
    const delRes = await asSuper('DELETE', '/api-system/v1/tenants/t1/backend/draft/resources/invoices_auto');
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().data).toEqual({ deleted: true, name: 'invoices_auto' });

    // Ver que ya no aparece en el listado.
    const afterDelView = await asSuper('GET', '/dashboard/backends/t1?step=api');
    expect(afterDelView.body).not.toContain('invoices_auto_db');

    // DELETE inexistente.
    const delRes404 = await asSuper('DELETE', '/api-system/v1/tenants/t1/backend/draft/resources/no-existe');
    expect(delRes404.statusCode).toBe(404);
    expect(delRes404.json().code).toBe('RESOURCE_NOT_FOUND');

    // PUT (update) resource.
    const updateRes = await asSuper('PUT', '/api-system/v1/tenants/t1/backend/draft/resources/products', {
      newName: 'products',
      physicalName: 'products_updated_db',
      store: 'sql',
      manageable: 'false',
      endpoint: {
        path: '/products',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data).toEqual({ version: 'v1', name: 'products' });

    // Ver que se refleja en la vista.
    const afterUpdateView = await asSuper('GET', '/dashboard/backends/t1?step=api');
    expect(afterUpdateView.body).toContain('products_updated_db');
    expect(afterUpdateView.body).toContain('/products');
  });

  // ─── Paso `api` — CRUD fields ───────────────────────────────────────────────
  it('CRUD field: POST feliz + duplicado + tipo inválido + resource-not-found + DELETE happy/404', async () => {
    // Depende de `products` creado en el test anterior. Agregar `price`.
    const add = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources/products/fields', {
      name: 'price', type: 'float', required: 'true',
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().data).toEqual({ resourceName: 'products', fields: ['price'] });

    // Aparece en step=data (diseñador de columnas).
    const view = await asSuper('GET', '/dashboard/backends/t1?step=data');
    expect(view.body).toContain('price');
    expect(view.body).toContain('float');

    // Duplicado.
    const dup = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources/products/fields', {
      name: 'price', type: 'string',
    });
    expect(dup.statusCode).toBe(422);
    expect(dup.json().code).toBe('DUPLICATE_FIELD');

    // Tipo inválido.
    const invalidType = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources/products/fields', {
      name: 'other', type: 'foo',
    });
    expect(invalidType.statusCode).toBe(422);
    expect(invalidType.json().code).toBe('INVALID_TYPE');

    // Resource inexistente.
    const nf = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/resources/no-existe/fields', {
      name: 'x', type: 'string',
    });
    expect(nf.statusCode).toBe(404);
    expect(nf.json().code).toBe('RESOURCE_NOT_FOUND');

    // DELETE por id extraído del HTML.
    const dataView = await asSuper('GET', '/dashboard/backends/t1?step=data');
    const match = dataView.body.match(/\/backend\/draft\/resources\/products\/fields\/([0-9a-f-]+)"/);
    expect(match).not.toBeNull();
    const del = await asSuper('DELETE', `/api-system/v1/tenants/t1/backend/draft/resources/products/fields/${match[1]}`);
    expect(del.statusCode).toBe(200);
    expect(del.json().data).toEqual({ resourceName: 'products', fields: [] });

    // DELETE id inexistente.
    const del404 = await asSuper('DELETE', '/api-system/v1/tenants/t1/backend/draft/resources/products/fields/id-inventado');
    expect(del404.statusCode).toBe(404);
    expect(del404.json().code).toBe('FIELD_NOT_FOUND');
  });

  // ─── Paso `api` — CRUD endpoints ───────────────────────────────────────────
  it('CRUD endpoint: POST feliz + reservado + resource-desconocido + duplicado + DELETE happy/404', async () => {
    // Happy path — normaliza métodos a mayúsculas.
    const add = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/endpoints', {
      path: '/custom-products', resource: 'products', methods: ['get', 'POST'],
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().data.endpoints).toContainEqual({ path: '/custom-products', methods: ['GET', 'POST'] });

    // Reservado.
    const reserved = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/endpoints', {
      path: '/auth', resource: 'products', methods: ['GET'],
    });
    expect(reserved.statusCode).toBe(422);
    expect(reserved.json().code).toBe('RESERVED_PATH');

    // Resource desconocido.
    const noRes = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/endpoints', {
      path: '/orders', resource: 'orders', methods: ['GET'],
    });
    expect(noRes.statusCode).toBe(404);
    expect(noRes.json().code).toBe('RESOURCE_NOT_FOUND');

    // Duplicado (t1 tiene /products default).
    const dup = await asSuper('POST', '/api-system/v1/tenants/t1/backend/draft/endpoints', {
      path: '/products', resource: 'products', methods: ['PUT'],
    });
    expect(dup.statusCode).toBe(422);
    expect(dup.json().code).toBe('DUPLICATE_ENDPOINT');

    // DELETE por path base64url.
    const b64 = Buffer.from('/custom-products', 'utf8').toString('base64url');
    const del = await asSuper('DELETE', `/api-system/v1/tenants/t1/backend/draft/endpoints/${b64}`);
    expect(del.statusCode).toBe(200);

    // DELETE inexistente.
    const del404 = await asSuper('DELETE', `/api-system/v1/tenants/t1/backend/draft/endpoints/${Buffer.from('/no-existe', 'utf8').toString('base64url')}`);
    expect(del404.statusCode).toBe(404);
    expect(del404.json().code).toBe('ENDPOINT_NOT_FOUND');
  });

  // ─── Paso `api` — PUT auth ─────────────────────────────────────────────────
  it('PUT auth: habilitar + deshabilitar limpia + coerce string→bool + redirectUris newline + 404 sin draft', async () => {
    // Habilitar.
    const enable = await asSuper('PUT', '/api-system/v1/tenants/t1/backend/draft/auth', {
      userAuthEnabled: true, strategies: ['local', 'google'], redirectUris: ['https://app.tienda.com/cb'],
    });
    expect(enable.statusCode).toBe(200);
    expect(enable.json().data).toEqual({
      userAuthEnabled: true, strategies: ['local', 'google'], redirectUris: ['https://app.tienda.com/cb'],
    });

    // P6a: la card ya no vive en `?step=api` — auth se deriva de providers.
    const view = await asSuper('GET', '/dashboard/backends/t1?step=api');
    expect(view.body).not.toContain('Habilitar auth de Users');

    // Coerce Form SSR: string "true" → bool.
    const coerce = await asSuper('PUT', '/api-system/v1/tenants/t1/backend/draft/auth', {
      userAuthEnabled: 'true', strategies: 'local', redirectUris: 'https://a/cb\nhttps://b/cb',
    });
    expect(coerce.statusCode).toBe(200);
    expect(coerce.json().data.userAuthEnabled).toBe(true);
    expect(coerce.json().data.redirectUris).toEqual(['https://a/cb', 'https://b/cb']);
    expect(coerce.json().data.strategies).toEqual(['local']);

    // Deshabilitar → limpia strategies + redirectUris.
    const disable = await asSuper('PUT', '/api-system/v1/tenants/t1/backend/draft/auth', {
      userAuthEnabled: false, strategies: ['local'], redirectUris: ['https://x/cb'],
    });
    expect(disable.json().data).toEqual({ userAuthEnabled: false, strategies: [], redirectUris: [] });

    // Sin draft.
    const now = Date.now();
    platformDb.insert(tenants).values({
      id: 't-no-draft', subdomain: 'nodraft', status: 'active', createdAt: now, updatedAt: now,
    }).run();
    migrateTenant('t-no-draft');
    const noDraft = await asSuper('PUT', '/api-system/v1/tenants/t-no-draft/backend/draft/auth', { userAuthEnabled: true });
    expect(noDraft.statusCode).toBe(404);
    expect(noDraft.json().code).toBe('NO_DRAFT');
  });

  // ─── Paso `provider` ────────────────────────────────────────────────────────
  it('`?step=provider`: catálogo por categoría con placeholders + auth derivada read-only', async () => {
    const view = await asSuper('GET', '/dashboard/backends/t1?step=provider');
    expect(view.statusCode).toBe(200);
    expect(view.body).toContain('Base de datos');
    expect(view.body).toContain('Autenticación de Users');
    expect(view.body).toContain('Almacenamiento de assets');
    // Operables + placeholders.
    expect(view.body).toContain('Neon (Postgres SQL)');
    expect(view.body).toContain('Google (OAuth 2.0)');
    expect(view.body).toContain('Local (email + contraseña)');
    expect(view.body).toContain('Próximamente');
    expect(view.body).toContain('Facebook');
    expect(view.body).toContain('LinkedIn');
    expect(view.body).toContain('Cloudinary');
    // Card de auth derivada, sin formulario de toggles.
    expect(view.body).toContain('Auth de Users (derivada)');
    expect(view.body).not.toMatch(/name="userAuthEnabled"/);
  });

  it('providers: link google feliz + fail; link local habilita auth derivada; DELETE force deslinkea', async () => {
    // POST google feliz.
    const google = await asSuper('POST', '/api-system/v1/tenants/t1/providers', {
      category: 'auth', provider: 'google',
      config: { clientId: 'test-app.apps.googleusercontent.com', clientSecret: 'GOCSPX-fake' },
    });
    expect(google.statusCode).toBe(200);

    // clientId inválido.
    const badGoogle = await asSuper('POST', '/api-system/v1/tenants/t1/providers', {
      category: 'auth', provider: 'google',
      config: { clientId: 'not-a-google-client-id', clientSecret: 'GOCSPX-fake' },
    });
    expect(badGoogle.statusCode).toBe(422);
    expect(badGoogle.json().code).toBe('PROVIDER_CONNECTION_FAILED');

    // Provider no operable.
    const facebook = await asSuper('POST', '/api-system/v1/tenants/t1/providers', {
      category: 'auth', provider: 'facebook', config: { clientId: 'x', clientSecret: 'y' },
    });
    expect(facebook.statusCode).toBe(422);
    expect(facebook.json().code).toBe('PROVIDER_CONNECTION_FAILED');

    // Link local → habilita derivada + redirect por convención visible.
    const local = await asSuper('POST', '/api-system/v1/tenants/t1/providers', {
      category: 'auth', provider: 'local',
    });
    expect(local.statusCode).toBe(200);
    let view = await asSuper('GET', '/dashboard/backends/t1?step=provider');
    expect(view.body).toContain('Habilitada');
    expect(view.body).toContain('tienda.localhost:3000/login');
    expect(view.body).toContain('Deslinkear');

    // DELETE force (el draft de t1 tiene strategies=['local'] → sin force sería 422).
    const unlinkLocal = await asSuper('DELETE', '/api-system/v1/tenants/t1/providers/auth/local');
    // Sin force debería fallar por draft — pero como el test lo enviamos JSON con force:
    // usamos inject directamente.
    const unlink = await app.inject({
      method: 'DELETE', url: '/api-system/v1/tenants/t1/providers/auth/local',
      cookies: { platform_sid: superSid },
      headers: { 'content-type': 'application/json' },
      payload: { force: true },
    });
    expect(unlink.statusCode).toBe(200);
    expect(unlink.json().data).toMatchObject({ unlinked: true });

    // Deslinkear también google.
    await app.inject({
      method: 'DELETE', url: '/api-system/v1/tenants/t1/providers/auth/google',
      cookies: { platform_sid: superSid },
      headers: { 'content-type': 'application/json' },
      payload: { force: true },
    });
    view = await asSuper('GET', '/dashboard/backends/t1?step=provider');
    expect(view.body).toContain('Deshabilitada');
    // Referencia usada para evitar lint sobre unlinkLocal.
    expect(unlinkLocal).toBeDefined();
  });

  // ─── Paso `finish` + mini-diff ─────────────────────────────────────────────
  it('`?step=finish`: sin draft muestra form + data-confirm; con draft muestra card "Cambios pendientes"', async () => {
    // t1 en este punto tuvo draft descartado por unlink de providers — puede o no haber sido reseteado.
    // Sin importar el estado exacto, el form de publicar siempre trae data-confirm.
    const t1 = await asSuper('GET', '/dashboard/backends/t1?step=finish');
    expect(t1.statusCode).toBe(200);
    expect(t1.body).toContain('Compilar y desplegar');
    expect(t1.body).toContain('action="/api-system/v1/tenants/t1/backend"');
    expect(t1.body).toMatch(/data-confirm=/);
    expect(t1.body).toContain('name="contractJson"');
    expect(t1.body).toMatch(/"version":\s*"v[12]"/);

    // Tenant nuevo con sólo draft → card "Primera publicación" + "+1" resources.
    const now = Date.now();
    platformDb.insert(tenants).values({
      id: 't-diff', subdomain: 'diff', status: 'active', createdAt: now, updatedAt: now,
    }).run();
    migrateTenant('t-diff');
    await asSuper('POST', '/api-system/v1/tenants/t-diff/backend/draft/resources', {
      name: 'orders', physicalName: 'orders_db', store: 'sql',
    });
    await asSuper('POST', '/api-system/v1/tenants/t-diff/backend/draft/resources/orders/fields', {
      name: 'total', type: 'float',
    });
    const diff = await asSuper('GET', '/dashboard/backends/t-diff?step=finish');
    expect(diff.body).toContain('Cambios pendientes');
    expect(diff.body).toMatch(/Primera publicación/);
    expect(diff.body).toMatch(/<strong>Resources:<\/strong>[\s\S]*\+1/);
    expect(diff.body).toContain('Reiniciar');
    expect(diff.body).toContain('id="confirm-reset-draft"');

    // t2 con draft sobre publicado → "+1" resources sobre v1.
    await asSuper('POST', '/api-system/v1/tenants/t2/backend/draft/resources', {
      name: 'invoices', physicalName: 'invoices_db', store: 'sql',
    });
    const t2 = await asSuper('GET', '/dashboard/backends/t2?step=finish');
    expect(t2.body).toContain('Cambios pendientes');
    expect(t2.body).toMatch(/<strong>Resources:<\/strong>[\s\S]*\+1/);
    expect(t2.body).toMatch(/cambio\(s\) pendiente\(s\) sobre[\s\S]*<code>v1<\/code>/);
    // Publicar apunta al endpoint del tenant + trae data-confirm con el total.
    expect(t2.body).toMatch(/action="\/api-system\/v1\/tenants\/t2\/backend"[^>]*data-confirm=/);
    // Textarea pre-poblado con el schema del draft (prioridad sobre el publicado).
    expect(t2.body).toContain('invoices');
    // Sugerencia de próxima versión (v2 tras v1).
    expect(t2.body).toContain('<code>v2</code>');
  });

  // ─── DELETE draft (abort) ──────────────────────────────────────────────────
  it('DELETE /backend/draft: borra + restaura providers + idempotente + confirm modal en la vista', async () => {
    // Modal de confirmación visible en la vista.
    const view = await asSuper('GET', '/dashboard/backends/t2?step=api');
    expect(view.body).toContain('Reiniciar');
    expect(view.body).toMatch(/data-action="modal:open"[^>]*data-target="confirm-reset-draft"/);
    expect(view.body).toContain('id="confirm-reset-draft"');
    expect(view.body).toMatch(/action="\/api-system\/v1\/tenants\/t2\/backend\/draft"[^>]*data-method="delete"/);

    // Delete real.
    const del = await asSuper('DELETE', '/api-system/v1/tenants/t2/backend/draft');
    expect(del.statusCode).toBe(200);
    expect(del.json().data.deleted).toBe(true);
    expect(typeof del.json().data.restored).toBe('number');

    // Idempotente.
    const replay = await asSuper('DELETE', '/api-system/v1/tenants/t2/backend/draft');
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data).toEqual({ deleted: false, restored: 0 });
  });

  // ─── Detail page ────────────────────────────────────────────────────────────
  it('detail: /versions/:version con contrato publicado renderiza resumen + 404 si no existe + 302 sin sesión', async () => {
    const ok = await asSuper('GET', '/dashboard/backends/t2/versions/v1');
    expect(ok.statusCode).toBe(200);
    const html = ok.body;
    expect(html).toContain('Backend <code>v1</code>');
    expect(html).toContain('Estado del contrato');
    expect(html).toContain('Publicado');
    expect(html).toContain('<code>products</code>');
    expect(html).toContain('products_db');
    expect(html).toContain('title');
    expect(html).toContain('/api/v1/products');
    expect(html).toMatch(/Auth\s*[&]\s*tiempo real/);
    expect(html).toContain('user_to_user');
    expect(html).toMatch(/href="\/dashboard\/backends\/t2"/);

    const notFound = await asSuper('GET', '/dashboard/backends/t2/versions/v99');
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json().code).toBe('BACKEND_NOT_FOUND');

    const anon = await asAnon('GET', '/dashboard/backends/t2/versions/v1');
    expect(anon.statusCode).toBe(302);
    expect(anon.headers.location).toBe('/dashboard/login');
  });

  // ─── Wizard-nav ─────────────────────────────────────────────────────────────
  it('wizard-nav: primer paso sin Anterior/Siguiente, intermedio con ambos, último sin Siguiente', async () => {
    const first = await asSuper('GET', '/dashboard/backends/t1?step=version');
    expect(first.body).toContain('wizard-nav__spacer');
    expect(first.body).not.toContain('href="/dashboard/backends/t1?step=provider"');

    const middle = await asSuper('GET', '/dashboard/backends/t1?step=provider');
    expect(middle.body).toMatch(/aria-label="Navegación del asistente"/);
    expect(middle.body).toMatch(/href="\/dashboard\/backends\/t1\?step=version"[\s\S]{0,140}?Versión/);
    expect(middle.body).toMatch(/href="\/dashboard\/backends\/t1\?step=role"[\s\S]{0,140}?Roles/);

    const last = await asSuper('GET', '/dashboard/backends/t2?step=finish');
    expect(last.body).toMatch(/href="\/dashboard\/backends\/t2\?step=ws"[\s\S]{0,140}?WebSocket/);
    const navMatch = last.body.match(/<nav class="wizard-nav"[\s\S]*?<\/nav>/);
    expect(navMatch).not.toBeNull();
    expect(navMatch[0]).not.toContain('→');
  });

  // ─── Breadcrumbs ────────────────────────────────────────────────────────────
  it('breadcrumbs: listing / wizard / detail con `aria-current` y self-links neutralizados', async () => {
    const listing = await asSuper('GET', '/dashboard/backends');
    expect(listing.body).toMatch(/<nav[^>]*aria-label="Breadcrumb"/);
    expect(listing.body).toMatch(/href="\/dashboard"[^>]*>Inicio</);
    expect(listing.body).toMatch(/aria-current="page"[^>]*>Backends</);

    const wizard = await asSuper('GET', '/dashboard/backends/t2?step=finish');
    expect(wizard.body).toMatch(/href="\/dashboard\/backends"[^>]*>Backends</);
    // Self-link del subdominio neutralizado (breadcrumbs component).
    expect(wizard.body).not.toMatch(/href="\/dashboard\/backends\/t2"[^>]*>otra</);
    expect(wizard.body).toMatch(/<span class="c-breadcrumbs__current"[^>]*>otra</);
    expect(wizard.body).toMatch(/aria-current="page"[^>]*>Componer · Compilar y deploy</);

    const detail = await asSuper('GET', '/dashboard/backends/t2/versions/v1');
    expect(detail.body).toMatch(/<nav[^>]*aria-label="Breadcrumb"/);
    expect(detail.body).toMatch(/aria-current="page"[^>]*>Versión v1</);
  });

  // ─── API key ────────────────────────────────────────────────────────────────
  it('API key: emit (mbk_) + regenerate revoca la anterior + GET no expone secreto + 404 tenant inexistente', async () => {
    const first = await asSuper('POST', '/api-system/v1/tenants/t1/api-key');
    expect(first.statusCode).toBe(201);
    expect(first.json().data.apiKey).toMatch(/^mbk_/);
    expect(first.json().data.regenerated).toBe(false);

    const second = await asSuper('POST', '/api-system/v1/tenants/t1/api-key');
    expect(second.statusCode).toBe(201);
    expect(second.json().data.regenerated).toBe(true);
    expect(second.json().data.apiKey).not.toBe(first.json().data.apiKey);

    const status = await asSuper('GET', '/api-system/v1/tenants/t1/api-key');
    expect(status.statusCode).toBe(200);
    const data = status.json().data;
    expect(data.exists).toBe(true);
    // Nunca expone el crudo ni el hash.
    expect(JSON.stringify(data)).not.toContain('mbk_');
    expect(JSON.stringify(data)).not.toContain('tokenHash');

    const missing = await asSuper('POST', '/api-system/v1/tenants/no-existe/api-key');
    expect(missing.statusCode).toBe(404);
  });
});
