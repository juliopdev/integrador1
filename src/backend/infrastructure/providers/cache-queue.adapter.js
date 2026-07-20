import { platformSqlite } from '../../config/database/platform/sqlite-platform.js';
import { uuidv7 } from '../../common/id.js';

// Cola de trabajos sobre la tabla `jobs` de platform.db. Mecánica del worker. Ver .doc/tree/.../infrastructure.md
// y .doc/rules/databases/platform.md (tabla jobs). La toma es atómica (UPDATE ... RETURNING) para evitar carreras.
// Los statements se preparan de forma perezosa (en el primer uso) para no exigir el schema al importar el módulo.

let s;
function stmts() {
  if (s) return s;
  s = {
    insert: platformSqlite.prepare(`
      INSERT INTO jobs (id, type, tenant_id, payload_json, status, attempts, max_attempts, available_at, created_at, updated_at)
      VALUES (@id, @type, @tenantId, @payloadJson, 'pending', 0, @maxAttempts, @availableAt, @now, @now)
    `),
    claim: platformSqlite.prepare(`
      UPDATE jobs SET status = 'processing', locked_at = @now, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM jobs WHERE status = 'pending' AND available_at <= @now ORDER BY available_at LIMIT 1
      )
      RETURNING *
    `),
    complete: platformSqlite.prepare(`UPDATE jobs SET status='completed', locked_at=NULL, updated_at=@now WHERE id=@id`),
    retry: platformSqlite.prepare(`UPDATE jobs SET status='pending', locked_at=NULL, available_at=@availableAt, last_error=@err, updated_at=@now WHERE id=@id`),
    fail: platformSqlite.prepare(`UPDATE jobs SET status='failed', locked_at=NULL, last_error=@err, updated_at=@now WHERE id=@id`),
    recover: platformSqlite.prepare(`
      UPDATE jobs SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
                      locked_at = NULL, updated_at = @now
      WHERE status = 'processing'
    `),
    cancelPending: platformSqlite.prepare(`DELETE FROM jobs WHERE id=@id AND status='pending'`),
    updateAvailableAt: platformSqlite.prepare(
      `UPDATE jobs SET available_at=@availableAt, updated_at=@now WHERE id=@id AND status='pending'`,
    ),
  };
  return s;
}

/**
 * Encola un trabajo en la tabla `jobs` de platform.db.
 * `opts.id` es opcional: si el caller pasa un id explícito (patrón usado por
 * `tenant-notifications` para hacer `job.id === notification.id`), se persiste tal cual;
 * si no, se genera un UUIDv7 aleatorio.
 *
 * @param {string} type - Tipo de job (ej. "notification.dispatch", "tenant.purge").
 * @param {object} [opts] - Opciones del trabajo.
 * @param {string} [opts.id] - ID explícito del job (opcional; se auto-genera si no se provee).
 * @param {string} [opts.tenantId] - ID del tenant asociado (puede ser null para jobs globales).
 * @param {*} [opts.payload] - Payload del trabajo (se serializa a JSON automáticamente).
 * @param {number} [opts.maxAttempts=3] - Número máximo de reintentos.
 * @param {number} [opts.availableAt] - Timestamp epoch ms desde el cual el job está disponible.
 * @returns {string} ID del job creado.
 */
export function enqueue(type, opts = {}) {
  const now = Date.now();
  const id = opts.id ?? uuidv7();
  stmts().insert.run({
    id,
    type,
    tenantId: opts.tenantId ?? null,
    payloadJson: opts.payload != null ? JSON.stringify(opts.payload) : null,
    maxAttempts: opts.maxAttempts ?? 3,
    availableAt: opts.availableAt ?? now,
    now,
  });
  return id;
}

/**
 * Cancela un job solo si sigue en estado 'pending'. No-op si el id no existe o ya fue procesado.
 *
 * @param {string} jobId - ID del job a cancelar.
 * @returns {number} Número de filas afectadas (0 si no había job pendiente con ese ID).
 */
export function cancelPending(jobId) {
  return stmts().cancelPending.run({ id: jobId }).changes;
}

/**
 * Re-agenda un job pendiente moviendo su `available_at`. Sólo aplica en estado 'pending';
 * si el worker ya lo tomó, la actualización es no-op.
 *
 * @param {string} jobId - ID del job a re-agendar.
 * @param {number} availableAt - Nuevo timestamp epoch ms para `available_at`.
 * @returns {number} Número de filas afectadas.
 */
export function updateAvailableAt(jobId, availableAt) {
  return stmts().updateAvailableAt.run({ id: jobId, availableAt, now: Date.now() }).changes;
}

/**
 * Toma atómicamente el siguiente job disponible (estado 'pending', `available_at <= now`)
 * mediante `UPDATE ... RETURNING`. Previene carreras entre réplicas del worker.
 *
 * @returns {object|undefined} Fila completa del job reclamado, o `undefined` si no hay jobs disponibles.
 */
export function claim() {
  return stmts().claim.get({ now: Date.now() });
}

/**
 * Marca un job como completado exitosamente.
 *
 * @param {string} id - ID del job a completar.
 */
export function complete(id) {
  stmts().complete.run({ id, now: Date.now() });
}

/**
 * Re-programa un job para reintento con backoff exponencial.
 *
 * @param {string} id - ID del job a reintentar.
 * @param {number} availableAt - Nuevo timestamp epoch ms para `available_at` (backoff).
 * @param {string} err - Mensaje de error del intento fallido.
 */
export function retry(id, availableAt, err) {
  stmts().retry.run({ id, availableAt, err, now: Date.now() });
}

/**
 * Marca un job como fallido definitivamente (agotó intentos).
 *
 * @param {string} id - ID del job a marcar como fallido.
 * @param {string} err - Mensaje de error del último intento.
 */
export function fail(id, err) {
  stmts().fail.run({ id, err, now: Date.now() });
}

/**
 * Re-encola (o falla, si agotó intentos) los jobs en estado 'processing' colgados tras un crash.
 * Debe llamarse al arrancar el worker.
 */
export function recoverStale() {
  stmts().recover.run({ now: Date.now() });
}
