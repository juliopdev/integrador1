/**
 * Fábrica para el caso de uso P6b: compila la matriz `endpoints[].access` del contrato publicado
 * hacia `roles.permissions_json` — una sola fuente de autorado (el asistente) con dos consumidores:
 * el dispatcher (audiencias public/user en el snapshot) y el RBAC existente del dashboard
 * (permissions_json por rol, formato `{ <version>: { <resource>: [verbos] } }`).
 *
 * Las audiencias `public`/`user` no tocan roles. Roles inexistentes se ignoran de forma
 * defensiva (el asistente v2 solo ofrece roles ya creados).
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.roleRepository - Repositorio de roles del tenant.
 * @param {Function} deps.roleRepository.findByName - Busca un rol por nombre.
 * @param {Function} deps.roleRepository.updatePermissions - Actualiza permisos de un rol.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(params: { contract: { version: string, endpoints?: Array<{ resource: string, access?: Object.<string, Array<string>> }> } }) =>
 *   { rolesUpdated: Array<string> }}
 */
export function makeCompileAccessToRoles({ roleRepository, now = () => Date.now() }) {
  /**
   * Compila la matriz de acceso del contrato y actualiza los permisos de cada rol.
   * @param {Object} params - Parámetros de compilación.
   * @param {Object} params.contract - Contrato No-Code publicado.
   * @param {string} params.contract.version - Versión del contrato.
   * @param {Array<{ resource: string, access?: Object.<string, Array<string>> }>} [params.contract.endpoints]
   *   - Endpoints con sus respectivas audiencias.
   * @returns {{ rolesUpdated: Array<string> }} Lista de nombres de roles cuyos permisos se actualizaron.
   * @example
   * compileAccessToRoles({
   *   contract: {
   *     version: 'v1',
   *     endpoints: [{ resource: 'users', access: { GET: ['admin'] } }]
   *   }
   * })
   * // { rolesUpdated: ['admin'] }
   */
  return function compileAccessToRoles({ contract }) {
    const byRole = {};
    for (const ep of contract.endpoints || []) {
      for (const [method, audiences] of Object.entries(ep.access || {})) {
        for (const aud of audiences) {
          if (aud === 'public' || aud === 'user') continue;
          const roleMap = (byRole[aud] ??= {});
          (roleMap[ep.resource] ??= new Set()).add(method);
        }
      }
    }

    const version = contract.version;
    const updated = [];
    for (const [roleName, resources] of Object.entries(byRole)) {
      const role = roleRepository.findByName(roleName);
      if (!role) continue;
      let permissions = {};
      try { permissions = JSON.parse(role.permissionsJson || '{}'); } catch { /* re-escribe */ }
      permissions[version] = Object.fromEntries(
        Object.entries(resources).map(([r, methods]) => [r, [...methods].sort()]),
      );
      roleRepository.updatePermissions({
        id: role.id,
        permissionsJson: JSON.stringify(permissions),
        now: now(),
      });
      updated.push(roleName);
    }
    return { rolesUpdated: updated };
  };
}
