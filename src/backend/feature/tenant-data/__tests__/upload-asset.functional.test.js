import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import FormData from 'form-data';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants } from '../../../config/drizzle/schema-platform.js';
import { roles as rolesTable, tenantUsers, userRoles, backendContracts, tenantProviders } from '../../../config/drizzle/schema-tenant.js';
import { hashSecret } from '../../../common/password.js';
import { uuidv7 } from '../../../common/id.js';
import { encrypt } from '../../../common/crypto.js';

// Adapter Cloudinary mockeado — retorna URL fake sin tocar Cloudinary real.
vi.mock('../../../infrastructure/providers/cloudinary.adapter.js', async () => {
  return {
    parseCloudinaryUri: () => ({ cloudName: 'mock', apiKey: 'k', apiSecret: 's' }),
    createCloudinaryStore: () => ({
      uploadBuffer: async ({ buffer, folder }) => ({
        publicId: `${folder}/mock-abc123`,
        url: `https://res.cloudinary.com/mock/image/upload/${folder}/mock-abc123.png`,
        format: 'png',
        bytes: buffer.length,
        width: 1, height: 1,
      }),
      destroy: async () => ({ result: 'ok' }),
    }),
  };
});

const HOST = 'shop.localhost';
const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let masterToken;

beforeAll(async () => {
  const { buildApp } = await import('../../../kernel/app.js');
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-upload-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  const db = drizzle(sqlite);

  // Master + rol para que el session-auth acepte.
  db.insert(rolesTable).values({ id: 'r-master', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db.insert(tenantUsers).values({
    id: 'u-master', email: 'master@shop.com',
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db.insert(userRoles).values({ userId: 'u-master', roleId: 'r-master', assignedAt: now }).run();

  // Contrato con un resource que tiene campo `hero` (asset) y `title` (string).
  db.insert(backendContracts).values({
    id: uuidv7(), version: 'v1', status: 'published',
    schemaJson: JSON.stringify({
      version: 'v1',
      stores: { sql: { provider: 'neon', enabled: true } },
      resources: [{
        name: 'products', physicalName: 'products_db', store: 'sql',
        fields: [
          { id: 'f1', name: 'title', type: 'string', required: true },
          { id: 'f2', name: 'hero',  type: 'asset',  provider: 'cloudinary' },
        ],
      }],
      endpoints: [],
      auth: { userAuthEnabled: false, strategies: [], redirectUris: [] },
    }),
    publishedAt: now, createdAt: now, updatedAt: now,
  }).run();

  // Provider cloudinary linkeado (creds fake, cifrado real).
  const configWrapper = JSON.stringify(encrypt(JSON.stringify({ uri: 'cloudinary://k:s@mock' })));
  db.insert(tenantProviders).values({
    id: uuidv7(), category: 'storage', provider: 'cloudinary',
    configValuesJson: configWrapper, enabled: 1, createdAt: now, updatedAt: now,
  }).run();
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
  if (originalDir !== undefined) env.TENANTS_DB_DIR = originalDir;
  // Defensivo: si `beforeAll` fallara antes de asignar `tmp`, un `rmSync(undefined, ...)`
  // lanza TypeError y oculta el error real del hook. Guardamos el cleanup.
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function multipartRequest({ resource, field, buffer, filename, mimeType, token }) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mimeType });
  return app.inject({
    method: 'POST',
    url: `/api-system/v1/data/${resource}/upload/${field}`,
    headers: { host: HOST, ...form.getHeaders(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    payload: form.getBuffer(),
  });
}

// PNG mínimo de 1x1 (para tests reales de Cloudinary también).
const TINY_PNG = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001010300000025db56ca00000003504c5445000000a77a3dda0000000174524e530040e6d8660000000a49444154081d63600000000200015b3c25990000000049454e44ae426082', 'hex');

describe('POST /data/:resource/upload/:field — upload de assets', () => {
  it('sin auth → 401', async () => {
    const res = await multipartRequest({ resource: 'products', field: 'hero', buffer: TINY_PNG, filename: 'a.png', mimeType: 'image/png' });
    expect(res.statusCode).toBe(401);
  });

  it('resource inexistente → 404', async () => {
    const res = await multipartRequest({ resource: 'no-existe', field: 'hero', buffer: TINY_PNG, filename: 'a.png', mimeType: 'image/png', token: masterToken });
    expect(res.statusCode).toBe(404);
  });

  it('field != asset (title) → 422 FIELD_NOT_ASSET', async () => {
    const res = await multipartRequest({ resource: 'products', field: 'title', buffer: TINY_PNG, filename: 'a.png', mimeType: 'image/png', token: masterToken });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('FIELD_NOT_ASSET');
  });

  it('mime prohibido → 422 INVALID_MIME', async () => {
    const res = await multipartRequest({ resource: 'products', field: 'hero', buffer: TINY_PNG, filename: 'a.swf', mimeType: 'application/x-shockwave-flash', token: masterToken });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_MIME');
  });

  it('sin multipart → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api-system/v1/data/products/upload/hero',
      headers: { host: HOST, authorization: `Bearer ${masterToken}`, 'content-type': 'application/json' },
      payload: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('happy path → 201 con { url, publicId } que apunta a Cloudinary (mockeado)', async () => {
    const res = await multipartRequest({ resource: 'products', field: 'hero', buffer: TINY_PNG, filename: 'hero.png', mimeType: 'image/png', token: masterToken });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.url).toContain('res.cloudinary.com');
    expect(body.publicId).toContain('t1/products_db/hero');
  });
});
