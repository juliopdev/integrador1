import { describe, it, expect, vi } from 'vitest';
import { makeScheduleNotification } from '../application/schedule-notification.usecase.js';
import { DomainError } from '../../../common/errors.js';

const author = { id: 'u-master', email: 'master@shop.com' };
const NOW = 1_000_000_000_000;
const FUTURE = NOW + 60_000;

function makeDeps() {
  const notificationRepository = { insertScheduled: vi.fn() };
  const jobQueue = { enqueue: vi.fn() };
  return {
    notificationRepository, jobQueue,
    usecase: makeScheduleNotification({
      notificationRepository, jobQueue, tenantId: 't1', now: () => NOW,
    }),
  };
}

describe('schedule-notification.usecase — encola + persiste con job.id === notification.id', () => {
  it('body válido → insertScheduled + enqueue con id compartido y availableAt=scheduledAt', async () => {
    const { notificationRepository, jobQueue, usecase } = makeDeps();
    const result = await usecase({ title: 'Aviso', body: 'Mañana bajamos.', audience: 'authenticated', scheduledAt: FUTURE, author });

    const insert = notificationRepository.insertScheduled.mock.calls[0][0];
    expect(insert.title).toBe('Aviso');
    expect(insert.audience).toBe('authenticated');
    expect(insert.scheduledAt).toBe(FUTURE);
    expect(insert.createdBy).toBe('u-master');

    const [jobType, jobOpts] = jobQueue.enqueue.mock.calls[0];
    expect(jobType).toBe('notification.dispatch');
    expect(jobOpts.id).toBe(insert.id); // pilar del diseño: cancel/reschedule por id directo
    expect(jobOpts.tenantId).toBe('t1');
    expect(jobOpts.availableAt).toBe(FUTURE);
    expect(jobOpts.payload).toEqual({ tenantId: 't1', notificationId: insert.id });

    expect(result).toMatchObject({ id: insert.id, status: 'scheduled', scheduledAt: FUTURE });
  });

  it('audience default → public', async () => {
    const { notificationRepository, usecase } = makeDeps();
    await usecase({ title: 'x', body: 'y', scheduledAt: FUTURE, author });
    expect(notificationRepository.insertScheduled.mock.calls[0][0].audience).toBe('public');
  });

  it('scheduledAt en el pasado → VALIDATION_ERROR (no persiste ni encola)', async () => {
    const { notificationRepository, jobQueue, usecase } = makeDeps();
    await expect(usecase({ title: 'x', body: 'y', scheduledAt: NOW - 1, author }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(notificationRepository.insertScheduled).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('scheduledAt === now (borde) → VALIDATION_ERROR (exigimos estrictamente futuro)', async () => {
    const { usecase } = makeDeps();
    await expect(usecase({ title: 'x', body: 'y', scheduledAt: NOW, author }))
      .rejects.toBeInstanceOf(DomainError);
  });

  it('title/body vacíos → VALIDATION_ERROR sin tocar el repo ni la cola', async () => {
    const { notificationRepository, jobQueue, usecase } = makeDeps();
    await expect(usecase({ title: '  ', body: 'y', scheduledAt: FUTURE, author }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(notificationRepository.insertScheduled).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });
});
