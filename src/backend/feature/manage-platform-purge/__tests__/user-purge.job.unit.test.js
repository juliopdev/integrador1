import { describe, it, expect, vi } from 'vitest';
import { makeUserPurgeJob } from '../application/user-purge.job.js';

function makeDeps() {
  const purgeCtx = { hardDeleteUser: vi.fn(() => 1) };
  const openTenantDbForPurge = vi.fn(() => purgeCtx);
  const destroyUserSessions = vi.fn(async () => {});
  return {
    purgeCtx, openTenantDbForPurge, destroyUserSessions,
    job: makeUserPurgeJob({ openTenantDbForPurge, destroyUserSessions }),
  };
}

describe('user.purge job', () => {
  it('orden: destroyUserSessions → hardDeleteUser', async () => {
    const { openTenantDbForPurge, destroyUserSessions, purgeCtx, job } = makeDeps();
    const res = await job({ tenantId: 't1', userId: 'u1' });
    expect(destroyUserSessions).toHaveBeenCalledWith({ tenantId: 't1', userId: 'u1' });
    expect(openTenantDbForPurge).toHaveBeenCalledWith('t1');
    expect(purgeCtx.hardDeleteUser).toHaveBeenCalledWith('u1');
    expect(res).toMatchObject({ tenantId: 't1', userId: 'u1', sessionsRevoked: true, userRowsDeleted: 1 });
  });

  it('destroyUserSessions falla → continúa el borrado (mismo espíritu que tenant.purge)', async () => {
    const openTenantDbForPurge = vi.fn(() => ({ hardDeleteUser: vi.fn(() => 1) }));
    const destroyUserSessions = vi.fn(async () => { throw new Error('valkey down'); });
    const job = makeUserPurgeJob({ openTenantDbForPurge, destroyUserSessions });
    const res = await job({ tenantId: 't1', userId: 'u1' });
    expect(res.sessionsRevoked).toBe(false);
    expect(res.sessionsError).toMatch(/valkey down/);
    expect(res.userRowsDeleted).toBe(1);
  });

  it('payload incompleto → throw (worker retry con backoff)', async () => {
    const { job } = makeDeps();
    await expect(job({ tenantId: 't1' })).rejects.toThrow(/Falta tenantId o userId/);
    await expect(job({ userId: 'u1' })).rejects.toThrow(/Falta tenantId o userId/);
    await expect(job({})).rejects.toThrow(/Falta tenantId o userId/);
  });
});
