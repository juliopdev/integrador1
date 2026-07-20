/**
 * Pruebas funcionales del hook tenant-loader con app completa.
 * Verifica que requests con host válido cargan el tenant correcto
 * y que hosts desconocidos/suspendidos/inexistentes responden
 * con los códigos y códigos de error esperados.
 *
 * @module KernelTenantLoaderFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../config/env.js';
import { migratePlatform, migrateTenant } from '../../config/drizzle/migrator.js';
import { platformDb } from '../../config/database/platform/sqlite-platform.js';
import { tenants } from '../../config/drizzle/schema-platform.js';
import { buildApp } from '../app.js';

let app;
let tmp;
let originalDir;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-loader-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb
    .insert(tenants)
    .values([
      { id: 't-act', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now },
      { id: 't-susp', subdomain: 'pausada', status: 'suspended', createdAt: now, updatedAt: now },
    ])
    .run();
  migrateTenant('t-act'); // el tenant activo necesita su .db (lo abre el pool)

  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

function me(host) {
  return app.inject({ method: 'GET', url: '/api-system/v1/me', headers: { host } });
}

describe('tenant-loader (funcional · resolución por subdominio)', () => {
  it('subdominio activo → pasa el loader (401 por falta de sesión, no 404)', async () => {
    const res = await me('tienda.localhost');
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });

  it('subdominio suspendido → 503', async () => {
    const res = await me('pausada.localhost');
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('TENANT_SUSPENDED');
  });

  it('subdominio inexistente → 404', async () => {
    const res = await me('fantasma.localhost');
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('TENANT_NOT_FOUND');
  });

  it('apex (sin subdominio) → contexto plataforma (401, no 404)', async () => {
    const res = await me('localhost');
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });
});
