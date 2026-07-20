import { describe, it, expect, vi } from 'vitest';
import { makeGetPlatformHealth } from '../application/get-platform-health.usecase.js';

const systemMetrics = {
  totalMemory: vi.fn(() => 1024),
  freeMemory: vi.fn(() => 512),
  loadAvg: vi.fn(() => [1.0, 0.5, 0.2]),
  hostname: vi.fn(() => 'test-host'),
  platform: vi.fn(() => 'linux'),
  arch: vi.fn(() => 'x64'),
  nodeVersion: 'v18.0.0',
  uptimeSec: vi.fn(() => 120),
  cpuCount: vi.fn(() => 4),
  fileSize: vi.fn(() => 0),
  sumDirSize: vi.fn((path) => ({ path, bytes: 0, count: 0 })),
  join: vi.fn((...parts) => parts.join('/')),
};

describe('get-platform-health.usecase', () => {
  it('agrega os info + counts + tamaños de disco en un snapshot', async () => {
    const platformCounts = vi.fn(() => ({
      tenants: { active: 3, subdomain: 'shop', suspended: 1, softDeleted: 0 },
      superadmins: 1, memberships: 5,
      frontends: { hosted: 0, external: 2 },
      backends: null,
    }));
    // dirs inexistentes → sumDirSize retorna 0 y no revienta.
    const usecase = makeGetPlatformHealth({ platformCounts, dataDir: '/tmp/nope', tenantsDbDir: '/tmp/nope-tenants', systemMetrics });
    const snap = await usecase();

    expect(snap.generatedAt).toBeGreaterThan(0);
    expect(snap.system.memory.totalBytes).toBeGreaterThan(0);
    expect(snap.system.cpu.cores).toBeGreaterThan(0);
    expect(snap.system.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(snap.storage.platformDb.bytes).toBe(0);        // no existe → 0
    expect(snap.storage.tenantDbs).toEqual({ path: '/tmp/nope-tenants', bytes: 0, count: 0 });
    expect(snap.platform.tenants.active).toBe(3);
    expect(platformCounts).toHaveBeenCalledOnce();
  });

  it('usagePct memoria dentro de [0,100]', async () => {
    const usecase = makeGetPlatformHealth({
      platformCounts: () => ({ tenants: { active: 0, suspended: 0, softDeleted: 0 }, superadmins: 0, memberships: 0, frontends: { hosted: 0, external: 0 }, backends: null }),
      dataDir: '/tmp/x', tenantsDbDir: '/tmp/y',
      systemMetrics,
    });
    const snap = await usecase();
    expect(snap.system.memory.usagePct).toBeGreaterThanOrEqual(0);
    expect(snap.system.memory.usagePct).toBeLessThanOrEqual(100);
  });

  it('Iter 55: `jobsSummary` inyectado → snapshot incluye jobs.byStatus + jobs.recent', async () => {
    const jobsSummary = vi.fn(() => ({
      byStatus: { pending: 2, processing: 1, completed: 47, failed: 3 },
      recent: [{ id: 'j1', type: 'backup.generate', status: 'completed', tenantId: null, attempts: 1, lastError: null, updatedAt: Date.now() }],
    }));
    const usecase = makeGetPlatformHealth({
      platformCounts: () => ({ tenants: { active: 0, suspended: 0, softDeleted: 0 }, superadmins: 0, memberships: 0, frontends: { hosted: 0, external: 0 }, backends: null }),
      jobsSummary,
      dataDir: '/tmp/x', tenantsDbDir: '/tmp/y',
      systemMetrics,
    });
    const snap = await usecase();
    expect(jobsSummary).toHaveBeenCalledOnce();
    expect(snap.jobs.byStatus.completed).toBe(47);
    expect(snap.jobs.recent).toHaveLength(1);
  });

  it('Iter 55: sin `jobsSummary` (compat) → snapshot con jobs vacíos (no throw)', async () => {
    const usecase = makeGetPlatformHealth({
      platformCounts: () => ({ tenants: { active: 0, suspended: 0, softDeleted: 0 }, superadmins: 0, memberships: 0, frontends: { hosted: 0, external: 0 }, backends: null }),
      dataDir: '/tmp/x', tenantsDbDir: '/tmp/y',
      systemMetrics,
    });
    const snap = await usecase();
    expect(snap.jobs).toEqual({ byStatus: { pending: 0, processing: 0, completed: 0, failed: 0 }, recent: [] });
  });
});
