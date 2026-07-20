/**
 * Iter 54b: helper defensivo que parsea `roles.permissionsJson` (formato del compile — ver
 * `compile-access-to-roles.usecase.js`) y responde flags binarios para filtrar tiles del home
 * Staff.
 *
 * Shape esperado: `{ <version>: { <resource>: [verbos] } }` donde verbos ∈ {'GET','POST','PUT','DELETE'}.
 * Cualquier JSON inválido o rol sin permissions → todos los flags en `false` (falla-seguro).
 *
 * @param {Object|null} role - Fila del rol (con `permissionsJson` y `name`).
 * @returns {{ hasReadAccess: boolean, hasAnyDataAccess: boolean, isSupport: boolean }} Flags de permisos parseados.
 * @example
 * parseRolePermissions({ name: 'editor', permissionsJson: '{"v1":{"articles":["GET","POST"]}}' })
 * // { hasReadAccess: true, hasAnyDataAccess: true, isSupport: false }
 */
export function parseRolePermissions(role) {
  const flags = { hasReadAccess: false, hasAnyDataAccess: false, isSupport: false };
  if (!role) return flags;

  // El rol "support" (nombre reservado del catálogo Staff) habilita el chat/soporte del tenant.
  // Ver la convención del sidebar en dashboard.ejs.
  if (typeof role.name === 'string' && role.name.toLowerCase() === 'support') {
    flags.isSupport = true;
  }

  let permissions;
  try {
    permissions = JSON.parse(role.permissionsJson || '{}');
  } catch {
    return flags;
  }
  if (!permissions || typeof permissions !== 'object') return flags;

  const READ_VERBS = new Set(['GET']);
  const WRITE_VERBS = new Set(['POST', 'PUT', 'DELETE']);

  for (const versionMap of Object.values(permissions)) {
    if (!versionMap || typeof versionMap !== 'object') continue;
    for (const verbs of Object.values(versionMap)) {
      if (!Array.isArray(verbs)) continue;
      for (const v of verbs) {
        const upper = String(v).toUpperCase();
        if (READ_VERBS.has(upper)) flags.hasReadAccess = true;
        if (READ_VERBS.has(upper) || WRITE_VERBS.has(upper)) flags.hasAnyDataAccess = true;
      }
    }
  }

  return flags;
}

/**
 * Convenience: dado el conjunto de roles del user (array de filas `roles`), devuelve el OR de los
 * flags. Un user con múltiples roles hereda TODOS sus permisos.
 *
 * @param {Array<Object|null>} rolesRows - Array de filas de roles (con `permissionsJson` y `name`).
 * @returns {{ hasReadAccess: boolean, hasAnyDataAccess: boolean, isSupport: boolean }} Flags combinados (OR lógico).
 * @example
 * combineRolePermissions([{ name: 'editor', permissionsJson: '{}' }, { name: 'support', permissionsJson: '{}' }])
 * // { hasReadAccess: false, hasAnyDataAccess: false, isSupport: true }
 */
export function combineRolePermissions(rolesRows) {
  const combined = { hasReadAccess: false, hasAnyDataAccess: false, isSupport: false };
  for (const role of rolesRows || []) {
    const flags = parseRolePermissions(role);
    combined.hasReadAccess = combined.hasReadAccess || flags.hasReadAccess;
    combined.hasAnyDataAccess = combined.hasAnyDataAccess || flags.hasAnyDataAccess;
    combined.isSupport = combined.isSupport || flags.isSupport;
  }
  return combined;
}
