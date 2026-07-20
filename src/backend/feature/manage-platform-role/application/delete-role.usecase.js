import { DomainError, NotFoundError } from '../../../common/errors.js';

/**
 * Fábrica para el caso de uso P7.2: elimina un rol de Staff creado en el asistente.
 * Solo categoría `staff` no reservada (`master`/`support` son del sistema). Si el rol aparece
 * en `endpoints[].access` de un contrato, el compilador simplemente lo ignora al re-publicar
 * (defensivo — no-code.md §10).
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.roleRepository - Repositorio de roles del tenant.
 * @returns {(params: { name: string }) => Promise<{ name: string, deleted: boolean }>}
 * @throws {NotFoundError} `ROLE_NOT_FOUND` — si el rol no existe.
 * @throws {DomainError} `RESERVED_ROLE` — si el rol es del sistema y no se puede eliminar.
 */
export function makeDeleteRole({ roleRepository }) {
  /**
   * Elimina un rol de Staff por su nombre.
   * @param {Object} params - Parámetros de eliminación.
   * @param {string} params.name - Nombre del rol a eliminar.
   * @returns {Promise<{ name: string, deleted: boolean }>}
   * @throws {NotFoundError} `ROLE_NOT_FOUND`
   * @throws {DomainError} `RESERVED_ROLE`
   */
  return async function deleteRole({ name }) {
    const role = roleRepository.findByName(name);
    if (!role) {
      throw new NotFoundError('ROLE_NOT_FOUND', 'El rol no existe.');
    }
    if (role.category !== 'staff' || role.isReserved) {
      throw new DomainError('RESERVED_ROLE', 'Los roles del sistema no se pueden eliminar.');
    }
    roleRepository.deleteById(role.id);
    return { name, deleted: true };
  };
}
