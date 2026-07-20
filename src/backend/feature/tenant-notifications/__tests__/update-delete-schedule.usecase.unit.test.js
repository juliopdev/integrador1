import { describe, it, expect, vi } from 'vitest';
import { makeUpdateScheduleNotification } from '../application/update-schedule-notification.usecase.js';
import { makeDeleteScheduleNotification } from '../application/delete-schedule-notification.usecase.js';
import { NotFoundError } from '../../../common/errors.js';

const NOW = 1_000_000_000_000;
const FUTURE = NOW + 60_000;
const existing = { id: 'n1', title: 'Orig', body: 'Bo', audience: 'public', scheduledAt: FUTURE, status: 'scheduled', createdBy: 'u1' };

function makeUpdateDeps({ found = existing, updateOk = true } = {}) {
  const notificationRepository = {
    findScheduledById: vi.fn(() => found),
    updateScheduled: vi.fn(() => updateOk),
  };
  const jobQueue = { updateAvailableAt: vi.fn() };
  return {
    notificationRepository, jobQueue,
    usecase: makeUpdateScheduleNotification({ notificationRepository, jobQueue, now: () => NOW }),
  };
}

describe('update-schedule-notification.usecase', () => {
  it('sólo scheduledAt → actualiza la fila + re-agenda el job (mismo id)', async () => {
    const { notificationRepository, jobQueue, usecase } = makeUpdateDeps();
    const newAt = FUTURE + 30_000;
    const result = await usecase({ id: 'n1', patch: { scheduledAt: newAt } });

    const update = notificationRepository.updateScheduled.mock.calls[0][0];
    expect(update.patch.scheduledAt).toBe(newAt);
    expect(jobQueue.updateAvailableAt).toHaveBeenCalledWith('n1', newAt);
    expect(result.scheduledAt).toBe(newAt);
  });

  it('patch de title/body/audience sin scheduledAt → NO toca la cola', async () => {
    const { jobQueue, usecase } = makeUpdateDeps();
    await usecase({ id: 'n1', patch: { title: 'Nuevo', body: 'Body', audience: 'authenticated' } });
    expect(jobQueue.updateAvailableAt).not.toHaveBeenCalled();
  });

  it('patch vacío → devuelve el existente sin tocar repo ni cola', async () => {
    const { notificationRepository, jobQueue, usecase } = makeUpdateDeps();
    const result = await usecase({ id: 'n1', patch: {} });
    expect(notificationRepository.updateScheduled).not.toHaveBeenCalled();
    expect(jobQueue.updateAvailableAt).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('scheduledAt en el pasado → VALIDATION_ERROR', async () => {
    const { usecase } = makeUpdateDeps();
    await expect(usecase({ id: 'n1', patch: { scheduledAt: NOW - 1 } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('id inexistente / status ≠ scheduled → NotFoundError', async () => {
    const { usecase } = makeUpdateDeps({ found: null });
    await expect(usecase({ id: 'zzz', patch: { title: 'x' } }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('race: findOk pero updateOk=false → NotFoundError (fue cancelada/publicada en el medio)', async () => {
    const { usecase } = makeUpdateDeps({ updateOk: false });
    await expect(usecase({ id: 'n1', patch: { title: 'x' } }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('title vacío en patch → VALIDATION_ERROR (no permitimos vaciar campos required)', async () => {
    const { usecase } = makeUpdateDeps();
    await expect(usecase({ id: 'n1', patch: { title: '   ' } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

function makeDeleteDeps({ cancelOk = true } = {}) {
  const notificationRepository = { cancelScheduled: vi.fn(() => cancelOk) };
  const jobQueue = { cancelPending: vi.fn(() => 1) };
  return {
    notificationRepository, jobQueue,
    usecase: makeDeleteScheduleNotification({ notificationRepository, jobQueue, now: () => NOW }),
  };
}

describe('delete-schedule-notification.usecase', () => {
  it('scheduled existente → cancela + elimina el job pendiente por id compartido', async () => {
    const { notificationRepository, jobQueue, usecase } = makeDeleteDeps();
    const result = await usecase({ id: 'n1' });
    expect(notificationRepository.cancelScheduled).toHaveBeenCalledWith({ id: 'n1', now: NOW });
    expect(jobQueue.cancelPending).toHaveBeenCalledWith('n1');
    expect(result).toEqual({ id: 'n1', canceled: true });
  });

  it('id inexistente / ya no scheduled → NotFoundError (no toca la cola)', async () => {
    const { jobQueue, usecase } = makeDeleteDeps({ cancelOk: false });
    await expect(usecase({ id: 'zzz' })).rejects.toBeInstanceOf(NotFoundError);
    expect(jobQueue.cancelPending).not.toHaveBeenCalled();
  });
});
