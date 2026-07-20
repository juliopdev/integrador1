import { describe, it, expect, vi } from 'vitest';
import { makePublishNotification } from '../application/publish-notification.usecase.js';
import { DomainError } from '../../../common/errors.js';

const author = { id: 'u-master', email: 'master@shop.com' };

function makeDeps({ broadcastImpl = vi.fn(async () => {}) } = {}) {
  const notificationRepository = { insertPublished: vi.fn() };
  const logger = { error: vi.fn() };
  return {
    notificationRepository, broadcast: broadcastImpl, logger,
    usecase: makePublishNotification({
      notificationRepository, broadcast: broadcastImpl, tenantId: 't1', logger,
    }),
  };
}

describe('publish-notification.usecase — Slice 1 (inmediato + broadcast)', () => {
  it('body válido → persiste `published` y difunde por WS con el mismo payload', async () => {
    const { notificationRepository, broadcast, usecase } = makeDeps();
    const result = await usecase({ title: '  Lanzamos v2 ', body: 'Con nuevas features.', audience: 'authenticated', author });

    const insert = notificationRepository.insertPublished.mock.calls[0][0];
    expect(insert.title).toBe('Lanzamos v2'); // trim
    expect(insert.body).toBe('Con nuevas features.');
    expect(insert.audience).toBe('authenticated');
    expect(insert.createdBy).toBe('u-master');
    expect(insert.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/); // UUIDv7
    expect(insert.now).toBeGreaterThan(0);

    // Broadcast recibe el canal 'notifications_global' + payload con el mismo id/title/publishedAt.
    const [channel, payload] = broadcast.mock.calls[0];
    expect(channel).toBe('notifications_global');
    expect(payload).toMatchObject({
      event: 'notification',
      data: { id: insert.id, title: 'Lanzamos v2', audience: 'authenticated' },
    });
    expect(payload.data.publishedAt).toBe(insert.now);

    // Retorna el shape que el handler serializará (no incluye createdBy).
    expect(result).toMatchObject({ id: insert.id, title: 'Lanzamos v2', audience: 'authenticated' });
    expect(result).not.toHaveProperty('createdBy');
  });

  it('audience por default → public si no se pasa', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await usecase({ title: 'Hola', body: 'Mundo', author });
    expect(notificationRepository.insertPublished.mock.calls[0][0].audience).toBe('public');
  });

  it('title vacío / body vacío → DomainError VALIDATION_ERROR sin tocar el repo', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await expect(usecase({ title: '   ', body: 'x', author })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(usecase({ title: 'x', body: '   ', author })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(notificationRepository.insertPublished).not.toHaveBeenCalled();
  });

  it('audience inválida (segment) → rechaza en el use case (slice 1 sólo public/authenticated)', async () => {
    const { usecase } = makeDeps();
    await expect(usecase({ title: 'x', body: 'y', audience: 'segment', author }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('sin author → DomainError (no se filtra desde el server sin identidad)', async () => {
    const { usecase } = makeDeps();
    await expect(usecase({ title: 'x', body: 'y' })).rejects.toBeInstanceOf(DomainError);
  });

  it('broadcast falla → NO tira el use case (persistencia igual queda, log del error)', async () => {
    const broadcastImpl = vi.fn(async () => { throw new Error('valkey caído'); });
    const { notificationRepository, usecase, logger } = makeDeps({ broadcastImpl });
    const result = await usecase({ title: 'x', body: 'y', author });
    expect(notificationRepository.insertPublished).toHaveBeenCalled();
    expect(result.id).toBeTruthy();
    expect(logger.error).toHaveBeenCalled();
  });
});
