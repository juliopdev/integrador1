/**
 * Smoke test del proceso worker (categoría 8/8).
 * NO importa worker.js directo (el loop polea al top-level). En su lugar
 * verifica que las fábricas de handlers y repositorios del composition-root
 * son importables, son funciones y aceptan deps stub sin lanzar.
 *
 * @module WorkerSmokeTest
 * @see {@link ../../.doc/rules/tests.md §2E}
 */
import { describe, it, expect } from 'vitest';
import { makeDispatchScheduledNotification } from '../../src/backend/feature/tenant-notifications/application/dispatch-scheduled-notification.usecase.js';
import { createNotificationRepository } from '../../src/backend/feature/tenant-notifications/infrastructure/notification.repository.js';
import { makeBackupGenerateJob } from '../../src/backend/feature/manage-platform-health/application/backup-generate.job.js';
import { makeLogsArchiveJob } from '../../src/backend/feature/manage-platform-log/application/logs-archive.job.js';
import { createLogRepository } from '../../src/backend/feature/manage-platform-log/infrastructure/log.repository.js';
import { makeTenantPurgeJob } from '../../src/backend/feature/manage-platform-purge/application/tenant-purge.job.js';
import { makeUserPurgeJob } from '../../src/backend/feature/manage-platform-purge/application/user-purge.job.js';
import { createPurgeRepository } from '../../src/backend/feature/manage-platform-purge/infrastructure/purge.repository.js';
import { createTenantPurgeRepository } from '../../src/backend/feature/manage-platform-purge/infrastructure/tenant-purge.repository.js';
import { createFsAdapter } from '../../src/backend/infrastructure/providers/fs.adapter.js';

// Smoke del proceso worker (categoría 8/8 · tests.md §2E). NO importa `worker.js` directo porque
// el módulo dispara `loop()` al top-level y quedaría poleando durante el test. En su lugar
// verificamos LO MISMO que el composition-root del worker:
//
//   1. Las fábricas de los 4 handlers son importables sin efectos colaterales.
//   2. Cada fábrica es una función (no un objeto ya invocado por error).
//   3. Cada fábrica se puede componer con deps stubbed sin arrojar — el handler resultante es
//      una función (async o sync) lista para procesar payloads.
//
// Si mañana alguien renombra un handler, cambia su firma o rompe una import, este smoke lo
// detecta al arranque del worker sin necesidad de correr un job real.

describe('worker — smoke de composición', () => {
  it('las 4 fábricas de handler son funciones importables (`notification.dispatch`, `backup.generate`, `logs.archive`, `tenant.purge`, `user.purge`)', () => {
    expect(makeDispatchScheduledNotification).toBeTypeOf('function');
    expect(makeBackupGenerateJob).toBeTypeOf('function');
    expect(makeLogsArchiveJob).toBeTypeOf('function');
    expect(makeTenantPurgeJob).toBeTypeOf('function');
    expect(makeUserPurgeJob).toBeTypeOf('function');
  });

  it('cada fábrica compone su handler sin lanzar cuando recibe deps con la forma esperada', () => {
    const noop = () => {};
    const stubLogger = { info: noop, warn: noop, error: noop, debug: noop };
    const stubFs = createFsAdapter(); // adapter real — no dispara IO hasta que se llame

    // notification.dispatch — necesita createNotificationRepository, getTenantDb, broadcastFor, logger.
    const notif = makeDispatchScheduledNotification({
      createNotificationRepository,
      getTenantDb: () => null,
      broadcastFor: () => async () => {},
      logger: stubLogger,
    });
    expect(notif).toBeTypeOf('function');

    // backup.generate — necesita handles y directorios; con stubs no dispara IO.
    const backup = makeBackupGenerateJob({
      platformDbHandle: null,
      tenantsDbDir: '/tmp/stub',
      backupsDir: '/tmp/stub-backups',
      openTenantDb: () => null,
      listTenantIds: () => [],
      fsAdapter: stubFs,
    });
    expect(backup).toBeTypeOf('function');

    // logs.archive — recibe repo estáticamente inyectable.
    const logs = makeLogsArchiveJob({
      logRepository: { listOld: () => [], archive: noop, deleteOld: noop },
    });
    expect(logs).toBeTypeOf('function');

    // tenant.purge — recibe purgeRepository, tenantsDbDir, fsAdapter y externalCleanups.
    const tenantPurge = makeTenantPurgeJob({
      purgeRepository: { listPendingTenants: () => [], deleteTenant: noop, markPurged: noop },
      tenantsDbDir: '/tmp/stub',
      fsAdapter: stubFs,
      externalCleanups: [],
    });
    expect(tenantPurge).toBeTypeOf('function');

    // user.purge — recibe openTenantDbForPurge (fábrica de repo), destroyUserSessions, externalCleanups.
    const userPurge = makeUserPurgeJob({
      openTenantDbForPurge: () => ({ listUserRefs: () => [], deleteUser: noop }),
      destroyUserSessions: async () => {},
      externalCleanups: [],
    });
    expect(userPurge).toBeTypeOf('function');
  });

  it('las fábricas de repositorios usadas en el composition-root son importables', () => {
    // Estos son los `create*` que worker.js usa para inyectar en las fábricas de handler.
    // Un rename/eliminación de cualquiera rompe el worker al arranque — el smoke lo detecta.
    expect(createNotificationRepository).toBeTypeOf('function');
    expect(createLogRepository).toBeTypeOf('function');
    expect(createPurgeRepository).toBeTypeOf('function');
    expect(createTenantPurgeRepository).toBeTypeOf('function');
    expect(createFsAdapter).toBeTypeOf('function');
  });
});
