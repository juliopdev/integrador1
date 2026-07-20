/**
 * Pruebas unitarias del handler dispatch-scheduled-notification (worker).
 * Verifica: marca published + difunde broadcast, skip si ya no está
 * scheduled, broadcast falla → no propaga (idempotente), payload
 * inválido → throw con retry en worker.
 *
 * @module TenantNotificationsDispatchScheduledUnitTest
 */
import { describe, it, expect, vi } from 'vitest';
import { makeDispatchScheduledNotification } from '../application/dispatch-scheduled-notification.usecase.js';

const PUBLISHED_ROW = { id: 'n1', title: 'T', body: 'B', audience: 'public', publishedAt: 999 };

/**
 * Construye dependencias mock para el handler de dispatch-scheduled-notification.
 * @param {Object} [opts]
 * @param {Object|null} [opts.markPublishedResult=PUBLISHED_ROW] - Resultado de markPublished.
 * @param {Function} [opts.broadcastImpl] - Implementación mock de broadcast.
 * @returns {{ repo: Object, createNotificationRepository: Function, getTenantDb: Function, broadcastFor: Function, broadcastImpl: Function, logger: Object, handler: Function }}
 */
function makeDeps({ markPublishedResult = PUBLISHED_ROW, broadcastImpl = vi.fn(async () => {}) } = {}) {
  const repo = { markPublished: vi.fn(() => markPublishedResult) };
  const createNotificationRepository = vi.fn(() => repo);
  const getTenantDb = vi.fn(() => ({ fake: 'db-t1' }));
  const broadcastFor = vi.fn(() => broadcastImpl);
  const logger = { error: vi.fn() };
  return {
    repo, createNotificationRepository, getTenantDb, broadcastFor, broadcastImpl, logger,
    handler: makeDispatchScheduledNotification({ createNotificationRepository, getTenantDb, broadcastFor, logger, now: () => 999 }),
  };
}

describe('dispatch-scheduled-notification.usecase (worker handler)', () => {
  it('marca published + difunde por notifications_global del tenant', async () => {
    const { repo, createNotificationRepository, getTenantDb, broadcastFor, broadcastImpl, handler } = makeDeps();
    const result = await handler({ tenantId: 't1', notificationId: 'n1' });

    expect(getTenantDb).toHaveBeenCalledWith('t1');
    expect(createNotificationRepository).toHaveBeenCalledWith({ db: { fake: 'db-t1' } });
    expect(repo.markPublished).toHaveBeenCalledWith({ id: 'n1', now: 999 });
    expect(broadcastFor).toHaveBeenCalledWith('t1');
    expect(broadcastImpl).toHaveBeenCalledWith('notifications_global', expect.objectContaining({
      event: 'notification',
      data: PUBLISHED_ROW,
    }));
    expect(result).toEqual({ published: true, id: 'n1' });
  });

  it('markPublished retorna null (cancel/duplicate retry) → skip sin difundir', async () => {
    const { broadcastImpl, handler } = makeDeps({ markPublishedResult: null });
    const result = await handler({ tenantId: 't1', notificationId: 'n1' });
    expect(broadcastImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true, reason: 'not_scheduled' });
  });

  it('broadcast falla → NO propaga (worker no reintenta un job cuya publicación en DB ya cerró)', async () => {
    const broadcastImpl = vi.fn(async () => { throw new Error('valkey down'); });
    const { handler, logger } = makeDeps({ broadcastImpl });
    const result = await handler({ tenantId: 't1', notificationId: 'n1' });
    expect(result).toEqual({ published: true, id: 'n1' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('payload inválido → throw (worker → retry con backoff)', async () => {
    const { handler } = makeDeps();
    await expect(handler({ tenantId: 't1' })).rejects.toThrow(/Falta tenantId o notificationId/);
    await expect(handler({ notificationId: 'n1' })).rejects.toThrow(/Falta tenantId o notificationId/);
  });
});
