import { uuidv7 } from '../../../common/id.js';
import { DomainError } from '../../../common/errors.js';

// Roles que no puede crear el Superadmin: reservados del sistema (master/support se auto-generan) y
// categorías que implicarían escalada de privilegios. Ver no-code.md y security.md.
const RESERVED_NAMES = new Set(['master', 'support', 'superadmin', 'user', 'admin', 'owner']);
const NAME_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Fábrica para el caso de uso que permite al Superadmin crear un rol **de categoría `staff`**
 * con su matriz de permisos (endpoint→verbos por versión). El Master luego solo lo **asigna**.
 * Rechaza nombres reservados o duplicados.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.roleRepository - Repositorio de roles del tenant.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(params: { name: string, permissions?: Object }) => Promise<{ roleId: string, name: string }>}
 * @throws {DomainError} `INVALID_ROLE_NAME` — si el nombre no cumple el formato snake_case.
 * @throws {DomainError} `RESERVED_ROLE` — si el nombre está reservado por el sistema.
 * @throws {DomainError} `ROLE_EXISTS` — si ya existe un rol con ese nombre en el tenant.
 */
export function makeConfigureRolePermissions({ roleRepository, now = () => Date.now() }) {
  /**
   * Crea un nuevo rol de categoría `staff` con la matriz de permisos especificada.
   * @param {Object} params - Parámetros de creación.
   * @param {string} params.name - Nombre del rol en snake_case (mín. 2 caracteres).
   * @param {Object} [params.permissions] - Matriz de permisos `{ <version>: { <resource>: [verbos] } }`.
   * @returns {Promise<{ roleId: string, name: string }>}
   * @throws {DomainError} `INVALID_ROLE_NAME` | `RESERVED_ROLE` | `ROLE_EXISTS`
   */
  return async function configureRolePermissions({ name, permissions }) {
    const normalized = String(name ?? '').trim().toLowerCase();
    if (normalized.length < 2 || !NAME_RE.test(normalized)) {
      throw new DomainError('INVALID_ROLE_NAME', 'El nombre del rol es inválido (snake_case, mínimo 2 caracteres).');
    }
    if (RESERVED_NAMES.has(normalized)) {
      throw new DomainError('RESERVED_ROLE', `El rol "${normalized}" está reservado por el sistema.`);
    }
    if (roleRepository.findByName(normalized)) {
      throw new DomainError('ROLE_EXISTS', 'Ya existe un rol con ese nombre en este tenant.');
    }

    const roleId = uuidv7();
    roleRepository.insert({
      id: roleId,
      name: normalized,
      category: 'staff',
      isReserved: 0,
      permissionsJson: JSON.stringify(permissions ?? {}),
      now: now(),
    });
    return { roleId, name: normalized };
  };
}
