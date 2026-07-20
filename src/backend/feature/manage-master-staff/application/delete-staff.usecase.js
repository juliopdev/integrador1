import { NotFoundError } from '../../../common/errors.js';

/**
 * Revoca el acceso de un colaborador: **soft-delete** del usuario e **invalidación inmediata** de sus
 * sesiones abiertas (el access token JWT vence en ≤15 min; la sesión en Valkey se borra ya).
 * Ver manage-master-staff.md (delete-staff) y security.md.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.staffRepository - Repositorio de staff del tenant.
 * @param {(p: { tenantId: string, userId: string }) => Promise<void>} deps.revokeSessions - Función para invalidar sesiones en Valkey.
 * @param {string} deps.tenantId - ID del tenant al que pertenece el colaborador.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @returns {(params: { userId: string }) => Promise<{ userId: string }>} Función de caso de uso.
 * @throws {NotFoundError} STAFF_NOT_FOUND - Si el colaborador no existe.
 */
export function makeDeleteStaff({ staffRepository, revokeSessions, tenantId, now = () => Date.now() }) {
  /**
   * Elimina (soft-delete) un colaborador y revoca sus sesiones activas.
   * @param {Object} params - Parámetros de la operación.
   * @param {string} params.userId - ID del colaborador a eliminar.
   * @returns {Promise<{ userId: string }>} ID del colaborador eliminado.
   * @throws {NotFoundError} STAFF_NOT_FOUND - Si el colaborador no existe.
   */
  return async function deleteStaff({ userId }) {
    if (!staffRepository.findUserById(userId)) {
      throw new NotFoundError('STAFF_NOT_FOUND', 'El colaborador no existe.');
    }
    staffRepository.softDeleteUser({ userId, now: now() });
    await revokeSessions({ tenantId, userId });
    return { userId };
  };
}
