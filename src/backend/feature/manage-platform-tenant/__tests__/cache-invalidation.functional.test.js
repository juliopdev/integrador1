/**
 * Pruebas funcionales de invalidación de caché de tenant-loader en Valkey.
 * Verifica que suspender, reactivar y soft-deletear un tenant borra su
 * clave en caché inmediatamente (sin esperar TTL) y la siguiente petición
 * refleja el nuevo estado.
 *
 * @module ManagePlatformTenantCacheInvalidationFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants, platformUsers } from '../../../config/drizzle/schema-platform.js';
import { hashSecret } from '../../../common/password.js';
import { valkey } from '../../../infrastructure/providers/cache-core.adapter.js';
import { tenantCacheKey } from '../../../kernel/hooks/tenant-loader.hook.js';
import { buildApp } from '../../../kernel/app.js';

const SUB = 'cacheable-tenant';
const HOST = `${SUB}.localhost`;
const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let superToken;
let tmp;
let originalDir;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-cache-inv-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(platformUsers).values({
    id: 'sa', email: 'super@baas.com',
    passwordHash: await hashSecret(PW),
    passphraseHash: await hashSecret(PP),
    createdAt: now, updatedAt: now,
  }).run();
  platformDb.insert(tenants).values({
    id: 't-cache', subdomain: SUB, status: 'active',
    createdAt: now, updatedAt: now,
  }).run();
  migrateTenant('t-cache');

  app = await buildApp();
  const login = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    payload: { email: 'super@baas.com', password: PW, passphrase: PP },
  });
  superToken = login.json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

const key = tenantCacheKey(SUB);

/**
 * Helper que cambia el estado de un tenant via PATCH /api-system/v1/tenants/t-cache/status.
 * @param {string} desiredStatus - 'active' | 'suspended'.
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const setStatus = (desiredStatus) => app.inject({
  method: 'PATCH',
  url: '/api-system/v1/tenants/t-cache/status',
  headers: { authorization: `Bearer ${superToken}`, 'content-type': 'application/json' },
  payload: { desiredStatus },
});
/**
 * Helper que soft-deletea un tenant via DELETE /api-system/v1/tenants/t-cache.
 * @param {string} confirmSubdomain - Subdominio a confirmar.
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
const softDelete = (confirmSubdomain) => app.inject({
  method: 'DELETE',
  url: '/api-system/v1/tenants/t-cache',
  headers: { authorization: `Bearer ${superToken}`, 'content-type': 'application/json' },
  payload: { confirmSubdomain },
});

describe('tenant-loader cache invalidation (funcional)', () => {
  it('suspender un tenant borra su clave en Valkey y bloquea la siguiente petición (503) sin esperar TTL', async () => {
    // 1. Petición al subdominio → warma la caché
    const warm = await app.inject({ method: 'GET', url: '/health', headers: { host: HOST } });
    expect(warm.statusCode).toBe(200);
    expect(await valkey.get(key)).not.toBeNull();

    // 2. Suspender el tenant vía la API de plataforma (desiredStatus explícito).
    const patch = await setStatus('suspended');
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.status).toBe('suspended');

    // 3. La clave debe estar borrada YA (no depende del TTL de 60s)
    expect(await valkey.get(key)).toBeNull();

    // 4. La siguiente petición al subdominio devuelve 503 (no 200 residual de la caché)
    const blocked = await app.inject({ method: 'GET', url: '/health', headers: { host: HOST } });
    expect(blocked.statusCode).toBe(503);
    expect(blocked.json().code).toBe('TENANT_SUSPENDED');
  });

  it('reactivar un tenant también invalida la caché (belt-and-suspenders) y la siguiente petición pasa', async () => {
    // Precondición: t-cache está suspendido del test anterior. Reactivamos.
    expect(await valkey.get(key)).toBeNull();

    const patch = await setStatus('active');
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.status).toBe('active');
    // La caché sigue vacía (nada nuevo se cacheó todavía).
    expect(await valkey.get(key)).toBeNull();

    // Siguiente petición al subdominio pasa (200) y ahora sí escribe caché.
    const res = await app.inject({ method: 'GET', url: '/health', headers: { host: HOST } });
    expect(res.statusCode).toBe(200);
    expect(await valkey.get(key)).not.toBeNull();
  });

  it('soft-delete borra la clave y la siguiente petición devuelve 404', async () => {
    // Precondición: caché con `active` del test anterior.
    expect(await valkey.get(key)).not.toBeNull();

    const del = await softDelete(SUB);
    expect(del.statusCode).toBe(200);
    expect(await valkey.get(key)).toBeNull();

    const gone = await app.inject({ method: 'GET', url: '/health', headers: { host: HOST } });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().code).toBe('TENANT_NOT_FOUND');
  });
});
