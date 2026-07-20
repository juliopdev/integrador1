import { describe, it, expect, vi } from 'vitest';
import { makeGetLatestPublishedNotifications } from '../application/get-latest-published-notifications.usecase.js';

function makeDeps({ rows = [] } = {}) {
  const notificationRepository = { listPublished: vi.fn(() => rows) };
  return {
    notificationRepository,
    usecase: makeGetLatestPublishedNotifications({ notificationRepository }),
  };
}

describe('get-latest-published-notifications.usecase — visibilidad por audience', () => {
  it('sin autenticar → sólo ve `public`', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await usecase({});
    expect(notificationRepository.listPublished).toHaveBeenCalledWith(
      expect.objectContaining({ visibleAudiences: ['public'] }),
    );
  });

  it('autenticado → suma `authenticated`', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await usecase({ isAuthenticated: true });
    expect(notificationRepository.listPublished).toHaveBeenCalledWith(
      expect.objectContaining({ visibleAudiences: ['public', 'authenticated'] }),
    );
  });

  it('limit/offset: clampa valores fuera de rango y usa defaults sensatos', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await usecase({ limit: '5', offset: '10' });
    expect(notificationRepository.listPublished).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, offset: 10 }),
    );

    // Overflow: limit > 100 se clampa a 100; negativos → 1 (limit) / 0 (offset).
    await usecase({ limit: 999, offset: -5 });
    expect(notificationRepository.listPublished).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 100, offset: 0 }),
    );

    await usecase({ limit: -3 });
    expect(notificationRepository.listPublished).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('sin args → limit=20 offset=0 (defaults documentados)', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await usecase();
    expect(notificationRepository.listPublished).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });

  it('devuelve directo lo que el repo entrega (sin re-mapear)', async () => {
    const rows = [{ id: 'n1', title: 'T', body: 'B', audience: 'public', publishedAt: 1 }];
    const { usecase } = makeDeps({ rows });
    const result = await usecase({});
    expect(result).toEqual(rows);
  });
});
