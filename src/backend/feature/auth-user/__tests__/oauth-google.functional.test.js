import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants } from '../../../config/drizzle/schema-platform.js';
import { tenantProviders, backendContracts } from '../../../config/drizzle/schema-tenant.js';
import { uuidv7 } from '../../../common/id.js';
import { encrypt } from '../../../common/crypto.js';
import { signOAuthState, signOAuthTicket } from '../infrastructure/oauth-tickets.js';

// Mockeamos el adapter Google ANTES de importar buildApp: los handlers lo consumen vía la fábrica
// createGoogleOAuthAdapter. Devolvemos un adapter con las 3 funciones stubbeadas.
vi.mock('../../../infrastructure/providers/google-oauth.adapter.js', async () => {
  const buildAuthorizeUrl = vi.fn(({ clientId, redirectUri, state, scopes }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scopes.join('+')}`);
  const exchangeCode = vi.fn(async () => ({ accessToken: 'fake-access-token', idToken: 'fake-id-token' }));
  const fetchUserInfo = vi.fn(async () => ({ sub: 'google-user-42', email: 'ana@example.com', name: 'Ana' }));
  return {
    createGoogleOAuthAdapter: () => ({ buildAuthorizeUrl, exchangeCode, fetchUserInfo }),
  };
});

const HOST = 'shop.localhost';
const CLIENT_ID = process.env.TEST_OAUTH_ID_CLIENT || 'stub-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.TEST_OAUTH_SECCRET_KEY || 'GOCSPX-stub';

let app;
let tmp;
let originalDir;

beforeAll(async () => {
  const { buildApp } = await import('../../../kernel/app.js');
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-oauth-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  const db = drizzle(sqlite);

  // Provider auth/google linkeado (creds cifradas AES-256-GCM).
  const configJson = JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  const configValuesJson = JSON.stringify(encrypt(configJson));
  db.insert(tenantProviders).values({
    id: uuidv7(), category: 'auth', provider: 'google', configValuesJson,
    enabled: 1, createdAt: now, updatedAt: now,
  }).run();

  // Contrato publicado con google en strategies.
  db.insert(backendContracts).values({
    id: uuidv7(), version: 'v1', status: 'published',
    schemaJson: JSON.stringify({
      version: 'v1',
      stores: { sql: { provider: 'neon', enabled: true } },
      resources: [], endpoints: [],
      auth: { userAuthEnabled: true, strategies: ['google'], redirectUris: [] },
    }),
    publishedAt: now, createdAt: now, updatedAt: now,
  }).run();
  sqlite.close();

  app = await buildApp();
}, 30_000); // hook robusto: el import dinámico de app.js supera 10s en máquinas lentas

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('OAuth Google — GET /auth/google (subdominio: initiate)', () => {
  it('con contrato + provider linkeados → 302 al authorize URL con state firmado', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/google', headers: { host: HOST } });
    expect(res.statusCode).toBe(302);
    const loc = res.headers.location;
    expect(loc).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(loc).toContain(`client_id=${CLIENT_ID}`);
    expect(loc).toContain(`redirect_uri=${encodeURIComponent('http://localhost:3000/auth/google/callback')}`);
    expect(loc).toContain('state=');
  });

  it('sin tenant (apex) → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/google' });
    expect(res.statusCode).toBe(404);
  });
});

describe('OAuth Google — GET /auth/google/callback (apex: dispatch)', () => {
  const state = signOAuthState({ tenantId: 't1', returnTo: '/', nonce: 'n-1' });

  it('con code + state válido → upsert user + 302 al subdominio /auth/exchange?ticket=', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=fake-code&state=${encodeURIComponent(state)}`,
    });
    expect(res.statusCode).toBe(302);
    const loc = res.headers.location;
    expect(loc.startsWith('http://shop.localhost:3000/auth/exchange?ticket=')).toBe(true);

    // Verificamos que el user quedó persistido con auth_provider=google.
    const sqlite = new Database(join(tmp, 't1.db'));
    const user = sqlite.prepare('SELECT email, auth_provider, provider_user_id, status FROM tenant_users WHERE provider_user_id=?').get('google-user-42');
    sqlite.close();
    expect(user).toMatchObject({ email: 'ana@example.com', auth_provider: 'google', status: 'active' });
  });

  it('state inválido → 400 INVALID_STATE', async () => {
    const res = await app.inject({
      method: 'GET', url: '/auth/google/callback?code=x&state=not-a-jwt',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_STATE');
  });

  it('sin code ni state → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/google/callback' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('OAuth Google — GET /auth/exchange (subdominio: session bridge)', () => {
  it('ticket válido → 302 a returnTo + cookie user_sid seteada', async () => {
    // Insertamos manualmente un user (o reusamos el creado por callback anterior).
    const sqlite = new Database(join(tmp, 't1.db'));
    const row = sqlite.prepare('SELECT id, email FROM tenant_users WHERE provider_user_id=?').get('google-user-42');
    sqlite.close();
    expect(row).toBeDefined();

    const ticket = signOAuthTicket({ userId: row.id, email: row.email, tenantId: 't1', returnTo: '/home' });
    const res = await app.inject({
      method: 'GET',
      url: `/auth/exchange?ticket=${encodeURIComponent(ticket)}`,
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/home');
    const userSid = res.cookies.find((c) => c.name === 'user_sid');
    expect(userSid?.value).toBeTruthy();
  });

  it('ticket con tenantId de OTRO tenant → 403 TENANT_MISMATCH', async () => {
    const ticket = signOAuthTicket({ userId: 'x', email: 'x@x', tenantId: 't2-otro', returnTo: '/' });
    const res = await app.inject({
      method: 'GET',
      url: `/auth/exchange?ticket=${encodeURIComponent(ticket)}`,
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('TENANT_MISMATCH');
  });

  it('ticket inválido → 400 INVALID_TICKET', async () => {
    const res = await app.inject({
      method: 'GET', url: '/auth/exchange?ticket=not-a-jwt', headers: { host: HOST },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_TICKET');
  });

  it('ticket con returnTo peligroso (empieza con //) → redirige a `/`', async () => {
    const sqlite = new Database(join(tmp, 't1.db'));
    const row = sqlite.prepare('SELECT id, email FROM tenant_users WHERE provider_user_id=?').get('google-user-42');
    sqlite.close();

    const ticket = signOAuthTicket({ userId: row.id, email: row.email, tenantId: 't1', returnTo: '//evil.com/path' });
    const res = await app.inject({
      method: 'GET',
      url: `/auth/exchange?ticket=${encodeURIComponent(ticket)}`,
      headers: { host: HOST },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('OAuth Google — estrategia deshabilitada / provider no linkeado', () => {
  it('tenant SIN google en strategies → 403 STRATEGY_DISABLED', async () => {
    const now = Date.now();
    platformDb.insert(tenants).values({ id: 't-no-google', subdomain: 'nogoogle', status: 'active', createdAt: now, updatedAt: now }).run();
    migrateTenant('t-no-google');
    const sqlite = new Database(join(tmp, 't-no-google.db'));
    const db = drizzle(sqlite);
    // Contrato sin google en strategies.
    db.insert(backendContracts).values({
      id: uuidv7(), version: 'v1', status: 'published',
      schemaJson: JSON.stringify({
        version: 'v1', stores: {}, resources: [], endpoints: [],
        auth: { userAuthEnabled: true, strategies: ['local'], redirectUris: [] },
      }),
      publishedAt: now, createdAt: now, updatedAt: now,
    }).run();
    sqlite.close();

    const res = await app.inject({ method: 'GET', url: '/auth/google', headers: { host: 'nogoogle.localhost' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('STRATEGY_DISABLED');
  });

  it('tenant con google en strategies pero SIN provider linkeado → 503 PROVIDER_NOT_LINKED', async () => {
    const now = Date.now();
    platformDb.insert(tenants).values({ id: 't-no-provider', subdomain: 'noprov', status: 'active', createdAt: now, updatedAt: now }).run();
    migrateTenant('t-no-provider');
    const sqlite = new Database(join(tmp, 't-no-provider.db'));
    const db = drizzle(sqlite);
    db.insert(backendContracts).values({
      id: uuidv7(), version: 'v1', status: 'published',
      schemaJson: JSON.stringify({
        version: 'v1', stores: {}, resources: [], endpoints: [],
        auth: { userAuthEnabled: true, strategies: ['google'], redirectUris: [] },
      }),
      publishedAt: now, createdAt: now, updatedAt: now,
    }).run();
    sqlite.close();

    const res = await app.inject({ method: 'GET', url: '/auth/google', headers: { host: 'noprov.localhost' } });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('PROVIDER_NOT_LINKED');
  });
});
