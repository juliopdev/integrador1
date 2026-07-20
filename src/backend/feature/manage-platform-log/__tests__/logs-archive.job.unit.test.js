import { describe, it, expect, vi } from 'vitest';
import { makeLogsArchiveJob } from '../application/logs-archive.job.js';

describe('logs.archive job', () => {
  it('default retentionDays=30 → deleteOlderThan(now - 30d)', async () => {
    const NOW = 1_000_000_000_000;
    const logRepository = { deleteOlderThan: vi.fn(() => 42) };
    const job = makeLogsArchiveJob({ logRepository, now: () => NOW });
    const res = await job();
    expect(logRepository.deleteOlderThan).toHaveBeenCalledWith(NOW - 30 * 86400_000);
    expect(res).toEqual({ retentionDays: 30, cutoff: NOW - 30 * 86400_000, deleted: 42 });
  });

  it('payload.retentionDays=7 → cutoff a 7 días atrás', async () => {
    const NOW = 1_000_000_000_000;
    const logRepository = { deleteOlderThan: vi.fn(() => 0) };
    const job = makeLogsArchiveJob({ logRepository, now: () => NOW });
    const res = await job({ retentionDays: 7 });
    expect(res.retentionDays).toBe(7);
    expect(res.cutoff).toBe(NOW - 7 * 86400_000);
  });

  it('retentionDays inválido → fallback a 30 (defensa contra payload malformado)', async () => {
    const logRepository = { deleteOlderThan: vi.fn(() => 0) };
    const job = makeLogsArchiveJob({ logRepository });
    const res1 = await job({ retentionDays: 'foo' });
    const res2 = await job({ retentionDays: -5 });
    expect(res1.retentionDays).toBe(30);
    expect(res2.retentionDays).toBe(30);
  });
});
