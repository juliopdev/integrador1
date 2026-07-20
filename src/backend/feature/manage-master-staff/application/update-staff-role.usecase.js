import { DomainError, NotFoundError } from '../../../common/errors.js';

/**
 * El Master asigna o revoca un rol **existente** a un colaborador (relación N:M en `user_roles`). Solo
 * roles de categoría `staff` (no puede ascender a `master`/reservados, ni crear roles). Ver
 * manage-master-staff.md (update-staff-role) y no-code.md.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.staffRepository - Repositorio de staff del tenant.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @returns {(params: { userId: string, roleId: string, action: 'assign'|'revoke' }) => Promise<{ userId: string, roleId: string, action: string }>} Función de caso de uso.
 * @throws {NotFoundError} STAFF_NOT_FOUND - Si el colaborador no existe.
 * @throws {DomainError} ROLE_NOT_FOUND - Si el rol indicado no existe.
 * @throws {DomainError} ROLE_NOT_ASSIGNABLE - Si el rol no es de categoría staff.
 */
export function makeUpdateStaffRole({ staffRepository, now = () => Date.now() }) {
  /**
   * Asigna o revoca un rol de categoría staff a un colaborador.
   * @param {Object} params - Parámetros de la operación.
   * @param {string} params.userId - ID del colaborador.
   * @param {string} params.roleId - ID del rol staff a asignar o revocar.
   * @param {'assign'|'revoke'} params.action - Acción a realizar.
   * @returns {Promise<{ userId: string, roleId: string, action: string }>} Resultado de la operación.
   * @throws {NotFoundError} STAFF_NOT_FOUND - Si el colaborador no existe.
   * @throws {DomainError} ROLE_NOT_FOUND - Si el rol no existe.
   * @throws {DomainError} ROLE_NOT_ASSIGNABLE - Si el rol no es asignable a staff.
   */
  return async function updateStaffRole({ userId, roleId, action }) {
    if (!staffRepository.findUserById(userId)) {
      throw new NotFoundError('STAFF_NOT_FOUND', 'El colaborador no existe.');
    }
    const role = staffRepository.findRoleById(roleId);
    if (!role) {
      throw new DomainError('ROLE_NOT_FOUND', 'El rol indicado no existe.');
    }
    if (role.category !== 'staff') {
      throw new DomainError('ROLE_NOT_ASSIGNABLE', 'Solo se pueden asignar roles de colaborador.');
    }

    if (action === 'assign') {
      staffRepository.assignRole({ userId, roleId, now: now() });
    } else {
      staffRepository.revokeRole({ userId, roleId });
    }
    return { userId, roleId, action };
  };
}
