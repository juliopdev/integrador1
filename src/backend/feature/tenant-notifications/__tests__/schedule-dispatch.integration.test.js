import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformSqlite } from '../../../config/database/platform/sqlite-platform.js';
import { tenantPool } from '../../../config/database/connection-pool/lru-manager.js';
import { claim, complete } from '../../../infrastructure/providers/cache-queue.adapter.js';
import { createNotificationRepository } from '../infrastructure/notification.repository.js';
import { makeScheduleNotification } from '../application/schedule-notification.usecase.js';
import { makeDispatchScheduledNotification } from '../application/dispatch-scheduled-notification.usecase.js';
import { enqueue, cancelPending, updateAvailableAt } from '../../../infrastructure/providers/cache-queue.adapter.js';

let tmp;
let originalDir;

beforeAll(() => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-notif-integ-'));
  env.TENANTS_DB_DIR = tmp;
  migrateTenant('t-int');

  // Seed del autor (FK notifications.created_by → tenant_users.id).
  const sqlite = new Database(join(tmp, 't-int.db'));
  const now = Date.now();
  sqlite.prepare(
    'INSERT INTO tenant_users (id, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run('u-mast', 'master@int.test', 'active', now, now);
  sqlite.close();
});

afterAll(() => {
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
  // Limpieza mínima: los jobs test-only quedan en platform.db in-memory; se re-migra en cada suite.
});

function openTenantDb() {
  const sqlite = new Database(join(tmp, 't-int.db'));
  return { sqlite, db: drizzle(sqlite) };
}

describe('Integración schedule → cola → dispatch (Slice 2)', () => {
  it('schedule persiste `scheduled` + inserta job.id === notification.id con available_at=scheduledAt', async () => {
    const { sqlite, db } = openTenantDb();
    const now = Date.now();
    const future = now + 60_000;

    const usecase = makeScheduleNotification({
      notificationRepository: createNotificationRepository({ db }),
      jobQueue: { enqueue },
      tenantId: 't-int',
    });
    const created = await usecase({
      title: 'Programado real', body: 'Cuerpo', scheduledAt: future,
      author: { id: 'u-mast' },
    });

    // Row en notifications con status='scheduled' y scheduledAt correcto.
    const notifRow = sqlite.prepare('SELECT id, status, scheduled_at FROM notifications WHERE id = ?').get(created.id);
    expect(notifRow.status).toBe('scheduled');
    expect(notifRow.scheduled_at).toBe(future);

    // Job en platform.db con id igual a la notificación + available_at = scheduledAt.
    const jobRow = platformSqlite.prepare('SELECT id, type, status, available_at FROM jobs WHERE id = ?').get(created.id);
    expect(jobRow.type).toBe('notification.dispatch');
    expect(jobRow.status).toBe('pending');
    expect(jobRow.available_at).toBe(future);

    sqlite.close();
  });

  it('worker handler → transiciona a published, broadcast recibe el evento, feed público la ve', async () => {
    const { sqlite, db } = openTenantDb();
    const now = Date.now();
    const future = now + 30_000;

    const usecase = makeScheduleNotification({
      notificationRepository: createNotificationRepository({ db }),
      jobQueue: { enqueue },
      tenantId: 't-int',
    });
    const created = await usecase({
      title: 'Dispatcheable', body: 'Body', scheduledAt: future,
      author: { id: 'u-mast' },
    });

    // Simulamos el worker: getTenantDb usa la MISMA sqlite subyacente del test para observar
    // cambios sin race del pool LRU.
    const broadcastSpy = vi.fn(async () => {});
    const dispatch = makeDispatchScheduledNotification({
      createNotificationRepository,
      getTenantDb: () => db,
      broadcastFor: () => broadcastSpy,
    });
    const result = await dispatch({ tenantId: 't-int', notificationId: created.id });
    expect(result).toEqual({ published: true, id: created.id });

    // Post-dispatch: status='published', publishedAt puesto, scheduledAt limpio.
    const row = sqlite.prepare('SELECT status, published_at, scheduled_at FROM notifications WHERE id = ?').get(created.id);
    expect(row.status).toBe('published');
    expect(row.published_at).toBeGreaterThan(0);
    expect(row.scheduled_at).toBeNull();

    // Broadcast recibió el payload correcto.
    expect(broadcastSpy).toHaveBeenCalledWith('notifications_global', expect.objectContaining({
      event: 'notification',
      data: expect.objectContaining({ id: created.id, title: 'Dispatcheable' }),
    }));

    // Feed público (via repo directo, sin HTTP) la muestra.
    const repo = createNotificationRepository({ db });
    const feed = repo.listPublished({ visibleAudiences: ['public'], limit: 20, offset: 0 });
    expect(feed.some((n) => n.id === created.id)).toBe(true);

    sqlite.close();
  });

  it('cancelPending → el worker toma el próximo job (el cancelado ya no existe)', async () => {
    const { sqlite, db } = openTenantDb();
    const now = Date.now();
    const past = now - 1000; // already-available → claim inmediato posible

    // Encolamos "a mano" para tener un job disponible ya (no requiere schedule use case).
    const jobId = 'test-cancel-1';
    enqueue('notification.dispatch', { id: jobId, tenantId: 't-int', payload: { tenantId: 't-int', notificationId: jobId }, availableAt: past });

    const affected = cancelPending(jobId);
    expect(affected).toBe(1);

    // Verificamos que el próximo `claim()` NO devuelva ese id (fue eliminado).
    const next = claim();
    if (next) {
      expect(next.id).not.toBe(jobId);
      complete(next.id); // limpiamos si tocó otro
    }

    sqlite.close();
  });

  it('updateAvailableAt → un job pendiente ve su hora movida al futuro', async () => {
    const jobId = 'test-reschedule-1';
    const past = Date.now() - 5000;
    const future = Date.now() + 3600_000;
    enqueue('notification.dispatch', { id: jobId, tenantId: 't-int', payload: { tenantId: 't-int', notificationId: jobId }, availableAt: past });

    const changes = updateAvailableAt(jobId, future);
    expect(changes).toBe(1);

    const row = platformSqlite.prepare('SELECT available_at FROM jobs WHERE id = ?').get(jobId);
    expect(row.available_at).toBe(future);

    // Cleanup.
    cancelPending(jobId);
  });

  it('closeAll libera conexiones del tenantPool sin dejar handles abiertos', () => {
    // Sanity: el pool no debería tener handles fantasma de tests previos.
    tenantPool.closeAll();
    expect(tenantPool.size).toBe(0);
  });
});
