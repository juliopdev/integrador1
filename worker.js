/**
 * @file Proceso worker de background (PM2 "baas-worker").
 * Gestiona una cola atómica de jobs vía `UPDATE … RETURNING` sobre SQLite.
 * Implementa claim → process → complete/retry/fail con backoff exponencial.
 * Actúa como composition root del worker, cableando los handlers de cada feature.
 */

import { join } from 'node:path';
import { env } from './src/backend/config/env.js';
import { migratePlatform } from './src/backend/config/drizzle/migrator.js';
import {
  claim,
  complete,
  retry,
  fail,
  recoverStale,
} from './src/backend/infrastructure/providers/cache-queue.adapter.js';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { tenantPool } from './src/backend/config/database/connection-pool/lru-manager.js';
import { publishMessage } from './src/backend/infrastructure/providers/chat-pubsub.adapter.js';
import { logger as workerLogger } from './src/backend/infrastructure/providers/logger.js';
import { destroyUserSessions } from './src/backend/infrastructure/providers/session.adapter.js';
import { createFsAdapter } from './src/backend/infrastructure/providers/fs.adapter.js';
import { platformDb, platformSqlite } from './src/backend/config/database/platform/sqlite-platform.js';
import { makeDispatchScheduledNotification } from './src/backend/feature/tenant-notifications/application/dispatch-scheduled-notification.usecase.js';
import { createNotificationRepository } from './src/backend/feature/tenant-notifications/infrastructure/notification.repository.js';
import { makeBackupGenerateJob } from './src/backend/feature/manage-platform-health/application/backup-generate.job.js';
import { makeLogsArchiveJob } from './src/backend/feature/manage-platform-log/application/logs-archive.job.js';
import { createLogRepository } from './src/backend/feature/manage-platform-log/infrastructure/log.repository.js';
import { makeTenantPurgeJob } from './src/backend/feature/manage-platform-purge/application/tenant-purge.job.js';
import { makeUserPurgeJob } from './src/backend/feature/manage-platform-purge/application/user-purge.job.js';
import { createPurgeRepository } from './src/backend/feature/manage-platform-purge/infrastructure/purge.repository.js';
import { createTenantPurgeRepository } from './src/backend/feature/manage-platform-purge/infrastructure/tenant-purge.repository.js';
import { isNull } from 'drizzle-orm';
import { tenants as tenantsTable } from './src/backend/config/drizzle/schema-platform.js';

const POLL_INTERVAL_MS = 2000;
const BACKOFF_BASE_MS = 5000;

/**
 * Registro global de handlers por tipo de job.
 * Las features lo pueblan importando este módulo y asignando a `handlers.set(type, fn)`.
 * @type {Map<string, (payload: Object|null, job: Object) => Promise<void>>}
 */
export const handlers = new Map();

let isShuttingDown = false;
let isProcessing = false;

/**
 * Claima, ejecuta y resuelve (complete/retry/fail) un único job de la cola.
 * @returns {Promise<boolean>} `true` si se procesó un job, `false` si no había o está en shutdown.
 */
async function processOne() {
  if (isShuttingDown) return false;
  const job = claim();
  if (!job) return false;

  isProcessing = true;
  try {
    const handler = handlers.get(job.type);
    if (!handler) throw new Error(`Sin handler para el job '${job.type}'`);
    await handler(job.payload_json ? JSON.parse(job.payload_json) : null, job);
    complete(job.id);
  } catch (err) {
    const message = err?.message ?? String(err);
    if (job.attempts < job.max_attempts) {
      retry(job.id, Date.now() + BACKOFF_BASE_MS * job.attempts, message);
    } else {
      fail(job.id, message);
    }
  } finally {
    isProcessing = false;
  }
  return true;
}

/**
 * Bucle principal de sondeo. Procesa jobs encolados hasta vaciar la cola,
 * luego espera `POLL_INTERVAL_MS` para reintentar.
 */
async function loop() {
  if (isShuttingDown) return;
  let more = true;
  while (more && !isShuttingDown) {
    more = await processOne();
  }
  if (!isShuttingDown) {
    setTimeout(loop, POLL_INTERVAL_MS);
  }
}

/**
 * Inicia el apagado ordenado: espera a que el job activo termine antes de salir.
 * @param {string} signal - Señal de terminación (SIGINT/SIGTERM).
 */
const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  workerLogger.info(`[worker] Recibida ${signal}, apagando worker de forma ordenada...`);

  const checkAndExit = () => {
    if (!isProcessing) {
      workerLogger.info('[worker] Worker apagado con éxito.');
      process.exit(0);
    } else {
      workerLogger.info('[worker] Esperando a que termine el trabajo activo antes de apagar...');
      setTimeout(checkAndExit, 500);
    }
  };
  checkAndExit();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

migratePlatform();
recoverStale();

// ── Registro de handlers ────────────────────────────────────────────────────
// Composition root del worker: cada handler se cablea con sus dependencias.
// Sigue el mismo patrón que bootstrap-platform.js en el servidor HTTP.

handlers.set('notification.dispatch', makeDispatchScheduledNotification({
  createNotificationRepository,
  getTenantDb: (tenantId) => drizzle(tenantPool.get(tenantId)),
  broadcastFor: (tenantId) => (channelName, payload) => publishMessage(tenantId, channelName, payload),
  logger: workerLogger,
}));

const dataDir = join(process.cwd(), 'data');
const backupsDir = join(dataDir, 'backups');
const fsAdapter = createFsAdapter();

handlers.set('backup.generate', makeBackupGenerateJob({
  platformDbHandle: platformSqlite,
  tenantsDbDir: env.TENANTS_DB_DIR,
  backupsDir,
  openTenantDb: (tenantId) => tenantPool.get(tenantId),
  listTenantIds: () => platformDb.select({ id: tenantsTable.id }).from(tenantsTable).where(isNull(tenantsTable.deletedAt)).all().map((r) => r.id),
  fsAdapter,
}));

handlers.set('logs.archive', makeLogsArchiveJob({
  logRepository: createLogRepository({ db: platformDb }),
}));

const purgeRepository = createPurgeRepository({ platformDb });
handlers.set('tenant.purge', makeTenantPurgeJob({
  purgeRepository,
  tenantsDbDir: env.TENANTS_DB_DIR,
  fsAdapter,
  externalCleanups: [],
}));

handlers.set('user.purge', makeUserPurgeJob({
  openTenantDbForPurge: (tenantId) => createTenantPurgeRepository({ db: drizzle(tenantPool.get(tenantId)) }),
  destroyUserSessions,
  externalCleanups: [],
}));

workerLogger.info(`[worker] arrancado (${env.NODE_ENV}) · polling cada ${POLL_INTERVAL_MS}ms · handlers: ${[...handlers.keys()].join(', ')}`);
loop();
