import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
/**
 * Pruebas unitarias del job tenant.purge.
 * Cubre: purge completo con orden estricto (externalCleanups → .db → hard-delete),
 * purge puntual por tenantId, tolerancia a fallos de adaptadores externos,
 * archivo .db inexistente, y graceDays=0.
 *
 * @module ManagePlatformPurgeTenantPurgeUnitTest
 */
import { makeTenantPurgeJob } from '../application/tenant-purge.job.js';

const NOW = 1_000_000_000_000;

const fsAdapter = {
  join: (...parts) => join(...parts),
  removeFile: vi.fn((path) => {
    if (existsSync(path)) {
      unlinkSync(path);
    } else {
      const err = new Error('File not found');
      err.code = 'ENOENT';
      throw err;
    }
  }),
};

let tenantsDbDir;
beforeEach(() => { tenantsDbDir = mkdtempSync(join(tmpdir(), 'baas-purge-')); });
afterEach(() => { rmSync(tenantsDbDir, { recursive: true, force: true }); });

describe('tenant.purge job', () => {
  it('lista soft-deleted expirados, borra .db + hard-delete en platform.db (orden estricto)', async () => {
    // Seed: tenant.db file existente en disco.
    writeFileSync(join(tenantsDbDir, 't-expired.db'), 'stub');
    const purgeRepository = {
      listExpiredSoftDeleted: vi.fn(() => [{ id: 't-expired', subdomain: 'shop' }]),
      hardDeleteTenant: vi.fn(() => 1),
    };
    const externalCall = vi.fn(async () => {});
    const externalCleanups = [{ name: 'neon', run: externalCall }];
    const job = makeTenantPurgeJob({ purgeRepository, tenantsDbDir, externalCleanups, fsAdapter, now: () => NOW });

    const res = await job({});
    // 1. cutoff correcto (default graceDays=30).
    expect(purgeRepository.listExpiredSoftDeleted).toHaveBeenCalledWith(NOW - 30 * 86400_000);
    // 2. Adapter externo corrió PRIMERO (antes de destruir la DB).
    expect(externalCall).toHaveBeenCalledWith('t-expired');
    // 3. Archivo físico borrado.
    expect(existsSync(join(tenantsDbDir, 't-expired.db'))).toBe(false);
    // 4. Hard-delete en platform.db.
    expect(purgeRepository.hardDeleteTenant).toHaveBeenCalledWith('t-expired');
    expect(res.purged[0]).toMatchObject({ tenantId: 't-expired', dbFileDeleted: true, platformRowsDeleted: 1 });
  });

  it('payload.tenantId → purga puntual, ignora el escaneo', async () => {
    const purgeRepository = {
      listExpiredSoftDeleted: vi.fn(),
      hardDeleteTenant: vi.fn(() => 1),
    };
    const job = makeTenantPurgeJob({ purgeRepository, tenantsDbDir, fsAdapter, now: () => NOW });
    await job({ tenantId: 't-single' });
    expect(purgeRepository.listExpiredSoftDeleted).not.toHaveBeenCalled();
    expect(purgeRepository.hardDeleteTenant).toHaveBeenCalledWith('t-single');
  });

  it('adapter externo falla → error capturado, purga continúa igual (idempotente, deletion.md §4)', async () => {
    writeFileSync(join(tenantsDbDir, 't-x.db'), 'stub');
    const purgeRepository = {
      listExpiredSoftDeleted: vi.fn(),
      hardDeleteTenant: vi.fn(() => 1),
    };
    const failing = { name: 'cloudinary', run: vi.fn(async () => { throw new Error('cloudinary down'); }) };
    const job = makeTenantPurgeJob({ purgeRepository, tenantsDbDir, fsAdapter, externalCleanups: [failing], now: () => NOW });
    const res = await job({ tenantId: 't-x' });

    expect(res.purged[0].externalErrors).toEqual([{ adapter: 'cloudinary', error: 'cloudinary down' }]);
    expect(existsSync(join(tenantsDbDir, 't-x.db'))).toBe(false); // se sigue destruyendo
    expect(purgeRepository.hardDeleteTenant).toHaveBeenCalledWith('t-x');
  });

  it('archivo .db inexistente → dbFileDeleted=false + code, no revienta el job', async () => {
    const purgeRepository = {
      listExpiredSoftDeleted: vi.fn(),
      hardDeleteTenant: vi.fn(() => 0),
    };
    const job = makeTenantPurgeJob({ purgeRepository, tenantsDbDir, fsAdapter, now: () => NOW });
    const res = await job({ tenantId: 't-nofile' });
    expect(res.purged[0].dbFileDeleted).toBe(false);
    expect(res.purged[0].dbFileError).toBe('ENOENT');
  });

  it('graceDays=0 → sin ventana, purga todo lo soft-deleted', async () => {
    const purgeRepository = {
      listExpiredSoftDeleted: vi.fn(() => []),
      hardDeleteTenant: vi.fn(),
    };
    const job = makeTenantPurgeJob({ purgeRepository, tenantsDbDir, fsAdapter, now: () => NOW });
    await job({ graceDays: 0 });
    expect(purgeRepository.listExpiredSoftDeleted).toHaveBeenCalledWith(NOW);
  });
});
