import { AppError } from '../../../common/errors.js';

/**
 * Fábrica para el handler del job `user.purge`. GDPR — hard-delete de un end-user o staff:
 * 1. Cierra sus sockets + revoca sus sesiones en Valkey (`destroyUserSessions`).
 * 2. Adapters externos (Cloudinary, etc.) — **stubbed en Slice A**.
 * 3. Hard-delete de la fila `tenant_users` en `tenant.db` → cascada real sobre `user_roles`.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {(tenantId: string) => { hardDeleteUser: (userId: string) => number }} deps.openTenantDbForPurge
 *   - Abre la base de datos del tenant y devuelve un contexto de purga.
 * @param {(opts: { tenantId: string, userId: string }) => Promise<void>} deps.destroyUserSessions
 *   - Adaptador que destruye sesiones activas (Valkey).
 * @param {Array<{ name: string, run: (opts: { tenantId: string, userId: string }) => Promise<void> }>} [deps.externalCleanups=[]]
 *   - Adaptadores de limpieza externa.
 * @returns {(payload?: { tenantId?: string, userId?: string }) =>
 *   Promise<{ tenantId: string, userId: string, sessionsRevoked?: boolean, externalErrors: Array, userRowsDeleted?: number }>}
 * @throws {AppError} `INVALID_PAYLOAD` — si falta `tenantId` o `userId`.
 */
export function makeUserPurgeJob({ openTenantDbForPurge, destroyUserSessions, externalCleanups = [] }) {
  /**
   * Ejecuta la purga (hard-delete) de un usuario en un tenant específico.
   * @param {Object} [payload] - Payload del job.
   * @param {string} [payload.tenantId] - ID del tenant al que pertenece el usuario.
   * @param {string} [payload.userId] - ID del usuario a purgar.
   * @returns {Promise<{ tenantId: string, userId: string, sessionsRevoked?: boolean, sessionsError?: string, externalErrors: Array, userRowsDeleted?: number }>}
   * @throws {AppError} `INVALID_PAYLOAD` — si falta `tenantId` o `userId`.
   */
  return async function userPurgeJob(payload) {
    if (!payload?.tenantId || !payload?.userId) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Falta tenantId o userId en el payload.');
    }
    const { tenantId, userId } = payload;

    const step = { tenantId, userId, externalErrors: [] };

    // 1. Revocar sesiones + cerrar sockets (best-effort — si Valkey cae, seguimos con el borrado).
    try {
      await destroyUserSessions({ tenantId, userId });
      step.sessionsRevoked = true;
    } catch (err) {
      step.sessionsRevoked = false;
      step.sessionsError = err?.message ?? String(err);
    }

    // 2. Adapters externos (assets Cloudinary, etc.).
    for (const adapter of externalCleanups) {
      try { await adapter.run({ tenantId, userId }); }
      catch (err) { step.externalErrors.push({ adapter: adapter.name, error: err?.message ?? String(err) }); }
    }

    // 3. Hard-delete en tenant.db.
    const purgeCtx = openTenantDbForPurge(tenantId);
    step.userRowsDeleted = purgeCtx.hardDeleteUser(userId);

    return step;
  };
}
