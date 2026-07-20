import { describe, it, expect, vi } from 'vitest';
import { makeGetScheduledNotifications } from '../application/get-scheduled-notifications.usecase.js';

function makeDeps({ rows = [] } = {}) {
  const notificationRepository = { listScheduled: vi.fn(() => rows) };
  return {
    notificationRepository,
    usecase: makeGetScheduledNotifications({ notificationRepository }),
  };
}

describe('get-scheduled-notifications.usecase', () => {
  it('defaults: limit=50 offset=0', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await usecase();
    expect(notificationRepository.listScheduled).toHaveBeenCalledWith({ limit: 50, offset: 0 });
  });

  it('clampa limit a [1, 200] y offset a ≥0', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await usecase({ limit: 999, offset: -5 });
    expect(notificationRepository.listScheduled).toHaveBeenCalledWith({ limit: 200, offset: 0 });

    await usecase({ limit: -3 });
    expect(notificationRepository.listScheduled).toHaveBeenLastCalledWith({ limit: 1, offset: 0 });
  });

  it('devuelve directo lo que trae el repo', async () => {
    const rows = [{ id: 'n1', title: 'x', body: 'y', audience: 'public', scheduledAt: 100, createdBy: 'u1' }];
    const { usecase } = makeDeps({ rows });
    expect(await usecase()).toEqual(rows);
  });
});
