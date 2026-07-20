import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants, platformUsers } from '../../../config/drizzle/schema-platform.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

// Verifica el shape alternativo de `POST /backend`: además del contrato como body directo, el
// endpoint acepta `{ contractJson: "..." }` (emitido por el `Form` del asistente SSR). Esta prueba
// NO necesita Neon: cortamos antes de `compile-backend` con un contrato inválido o JSON inválido.

const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let superToken;
let tmp;
let originalDir;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-publish-json-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(platformUsers).values({
    id: 'sa', email: 'super@baas.com',
    passwordHash: await hashSecret(PW),
    passphraseHash: await hashSecret(PP),
    createdAt: now, updatedAt: now,
  }).run();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  app = await buildApp();
  const login = await app.inject({ method: 'POST', url: '/api-system/v1/login', payload: { email: 'super@baas.com', password: PW, passphrase: PP } });
  superToken = login.json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const post = (payload) => app.inject({
  method: 'POST',
  url: '/api-system/v1/tenants/t1/backend',
  headers: { authorization: `Bearer ${superToken}` },
  payload,
});

describe('POST /backend — wrapper `contractJson` (Form SSR)', () => {
  it('rechaza `contractJson` con JSON malformado → 400 INVALID_JSON', async () => {
    const res = await post({ contractJson: '{ this is not json' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_JSON');
  });

  it('desenvuelve `contractJson` con JSON válido pero contrato inválido → 422 INVALID_CONTRACT', async () => {
    // Contrato JSON válido pero sintácticamente incorrecto (falta `resources`, etc.). El endpoint
    // debe llegar hasta `publishContract` (que valida la gramática) y devolver el DomainError.
    const res = await post({ contractJson: JSON.stringify({ version: 'v1' }) });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_CONTRACT');
  });

  it('sigue aceptando el shape directo (contrato como body) — retro-compat', async () => {
    const res = await post({ version: 'no-es-v-numero' });
    // También llega a `publishContract` → INVALID_CONTRACT (no INVALID_JSON).
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_CONTRACT');
  });
});
