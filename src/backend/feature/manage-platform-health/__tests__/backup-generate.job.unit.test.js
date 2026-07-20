import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
/**
 * Pruebas unitarias del job backup.generate.
 * Verifica creación de directorio timestamped, backup de platform + tenants,
 * tolerancia a fallos individuales, y retención (prune candidates).
 *
 * @module ManagePlatformHealthBackupGenerateUnitTest
 */
import { makeBackupGenerateJob } from '../application/backup-generate.job.js';
import { createFsAdapter } from '../../../infrastructure/providers/fs.adapter.js';

let tmp;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'baas-bk-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('backup.generate job', () => {
  const fsAdapter = createFsAdapter();

  it('crea el directorio timestamped y llama `.backup()` sobre platform + cada tenant', async () => {
    const backupsDir = join(tmp, 'backups');
    const tenantsDbDir = join(tmp, 'tenants');

    // Simula el efecto secundario de `.backup()`: escribe un archivo real en la ruta destino.
    const backupImpl = (label) => (path) => { writeFileSync(path, `snapshot:${label}`); return Promise.resolve(); };

    const platformDbHandle = { backup: vi.fn(backupImpl('platform')) };
    const openTenantDb = vi.fn((id) => ({ backup: backupImpl(id) }));
    const listTenantIds = vi.fn(() => ['t-shop', 't-blog']);

    const job = makeBackupGenerateJob({ platformDbHandle, tenantsDbDir, backupsDir, openTenantDb, listTenantIds, fsAdapter });
    const res = await job({});

    expect(res.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    expect(res.platformDb.bytes).toBeGreaterThan(0);
    expect(statSync(res.platformDb.out).size).toBeGreaterThan(0);

    expect(res.tenants).toHaveLength(2);
    expect(res.tenants[0].tenantId).toBe('t-shop');
    expect(res.tenants[0].bytes).toBeGreaterThan(0);
    expect(res.tenants[1].tenantId).toBe('t-blog');
    expect(platformDbHandle.backup).toHaveBeenCalledOnce();
    expect(openTenantDb).toHaveBeenCalledTimes(2);
  });

  it('un tenant que falla → resto continúa; el error queda en el resultado (idempotente)', async () => {
    const backupsDir = join(tmp, 'backups');
    const platformDbHandle = { backup: vi.fn(async (p) => writeFileSync(p, 'x')) };
    const openTenantDb = vi.fn((id) => id === 't-broken'
      ? { backup: () => { throw new Error('disk full'); } }
      : { backup: async (p) => writeFileSync(p, 'ok') });

    const job = makeBackupGenerateJob({
      platformDbHandle, tenantsDbDir: '/nope', backupsDir,
      openTenantDb, listTenantIds: () => ['t-broken', 't-ok'],
      fsAdapter,
    });
    const res = await job({});

    expect(res.tenants[0]).toMatchObject({ tenantId: 't-broken', error: expect.stringMatching(/disk full/) });
    expect(res.tenants[1]).toMatchObject({ tenantId: 't-ok', bytes: expect.any(Number) });
  });

  it('retentionDays > 0 → lista candidatos a purga (dirs viejos)', async () => {
    const backupsDir = join(tmp, 'backups');
    const platformDbHandle = { backup: vi.fn(async (p) => writeFileSync(p, 'x')) };
    const job = makeBackupGenerateJob({
      platformDbHandle, tenantsDbDir: '/nope', backupsDir,
      openTenantDb: () => ({ backup: vi.fn() }), listTenantIds: () => [],
      fsAdapter,
    });
    const res = await job({ retentionDays: 7 });
    // No hay dirs viejos, pero el campo `pruned` existe y es un array.
    expect(res.pruned).toEqual([]);
  });
});
