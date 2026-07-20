import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migrateTenant } from '../../../config/drizzle/migrator.js';
import { makeProvisionTenantDb } from '../application/provision-tenant-db.usecase.js';

// Tablas esperadas del esquema base de tenant (schema-tenant.js).
const EXPECTED = [
  'roles', 'tenant_users', 'user_roles', 'auth_tokens',
  'backend_contracts', 'tenant_providers', 'api_keys', 'notifications', 'tenant_logs_local',
];

describe('provisionTenantDb (integración · DB física)', () => {
  const original = env.TENANTS_DB_DIR;
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'baas-tenants-'));
    env.TENANTS_DB_DIR = tmp; // migrateTenant escribe aquí
  });

  afterEach(() => {
    env.TENANTS_DB_DIR = original;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('crea <tenantId>.db real con todas las tablas del esquema base', async () => {
    const provision = makeProvisionTenantDb({ migrateTenant });
    const { dbPath } = await provision({ tenantId: 'tenant-abc' });

    expect(existsSync(dbPath)).toBe(true);
    const sqlite = new Database(dbPath, { readonly: true });
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    sqlite.close();

    expect(tables).toEqual(expect.arrayContaining(EXPECTED));
  });

  it('es idempotente (re-provisionar no falla)', async () => {
    const provision = makeProvisionTenantDb({ migrateTenant });
    await provision({ tenantId: 'tenant-xyz' });
    await expect(provision({ tenantId: 'tenant-xyz' })).resolves.toMatchObject({ tenantId: 'tenant-xyz' });
  });
});
