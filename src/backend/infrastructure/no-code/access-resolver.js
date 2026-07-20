import { verifyAccessToken } from '../../common/jwt.js';
import { hashToken } from '../../common/token.js';

/**
 * P6b (no-code.md §9-§10): resolución de audiencias del dispatcher No-Code.
 * `endpoints[].access = { <METHOD>: ["public" | "user" | <rolStaff>…] }`; sin entrada para el
 * método ⇒ `public` (compatibilidad v1). Audiencia `user` la satisfacen el JWT de User del
 * tenant o la API key `mbk_…` (hash en `api_keys`); los roles Staff salen del JWT scope
 * `tenant` + `user_roles`. `master` tiene acceso total (§10).
 *
 * Helpers puros/inyectables para poder testearlos sin red ni Fastify.
 */

/**
 * Devuelve las audiencias exigidas para un método HTTP del endpoint, o `null` si es público.
 * Sin entrada para el método ⇒ `public` (compatibilidad v1).
 *
 * @param {object} endpoint - Endpoint del contrato con su `access` map.
 * @param {string} method - Método HTTP (GET, POST, PUT, DELETE).
 * @returns {string[]|null} Lista de audiencias requeridas, o `null` si el método es público.
 * @example
 * requiredAudiences({ access: { POST: ['user', 'admin'] } }, 'POST')
 * // → ['user', 'admin']
 * requiredAudiences({}, 'GET')
 * // → null
 */
export function requiredAudiences(endpoint, method) {
  const audiences = endpoint?.access?.[method];
  if (!audiences || audiences.length === 0 || audiences.includes('public')) return null;
  return audiences;
}

/**
 * Identifica al llamador a partir del header Authorization.
 * Soporta JWT Bearer token (scope 'user' o 'tenant') y API key `mbk_` del tenant.
 *
 * @param {{ authorization: string, tenantId: string, deps: { findApiKeyByHash?: (hash: string) => object|null, touchApiKey?: (id: string) => void, listRoleNamesForUser?: (userId: string) => string[] } }} params
 * @param {string} params.authorization - Valor del header Authorization.
 * @param {string} params.tenantId - ID del tenant para verificación cross-tenant.
 * @param {object} params.deps - Dependencias inyectadas (findApiKeyByHash, touchApiKey, listRoleNamesForUser).
 * @returns {{ kind: 'user', userId?: string } | { kind: 'staff', userId: string, roles: string[] } | null}
 */
export function resolveAudience({ authorization, tenantId, deps }) {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  // API key del tenant (P4): solo el hash vive en `api_keys`; cuenta como audiencia `user`.
  if (token.startsWith('mbk_')) {
    const key = deps.findApiKeyByHash ? deps.findApiKeyByHash(hashToken(token)) : null;
    if (!key) return null;
    try { deps.touchApiKey?.(key.id); } catch { /* best-effort */ }
    return { kind: 'user' };
  }

  let claims;
  try { claims = verifyAccessToken(token); } catch { return null; }
  if (!claims || claims.tenantId !== tenantId) return null; // anti cross-tenant
  if (claims.scope === 'user') return { kind: 'user', userId: claims.sub };
  if (claims.scope === 'tenant') {
    const roles = deps.listRoleNamesForUser ? deps.listRoleNamesForUser(claims.sub) : [];
    return { kind: 'staff', userId: claims.sub, roles };
  }
  return null;
}

/**
 * Verifica si una audiencia satisface los requisitos de acceso del método.
 * Los staff con rol `master` tienen acceso total en su tenant.
 * Si `required` incluye `'owner'`, se permite avanzar para verificar propiedad en BD.
 *
 * @param {string[]} required - Lista de audiencias requeridas por el endpoint.
 * @param {{ kind: 'user' | 'staff', roles?: string[] }|null} audience - Audiencia resuelta del llamador.
 * @returns {boolean} `true` si el acceso está permitido.
 * @example
 * isAllowed(['admin'], { kind: 'staff', roles: ['admin'] })
 * // → true
 * isAllowed(['user'], { kind: 'staff', roles: ['editor'] })
 * // → false
 */
export function isAllowed(required, audience) {
  if (!audience) return false;
  if (audience.kind === 'staff' && audience.roles.includes('master')) return true; // acceso total en su tenant (§10)
  if (required.includes('owner')) return true; // permitido avanzar para verificar propiedad en BD
  if (audience.kind === 'user') return required.includes('user');
  if (audience.kind === 'staff') {
    return required.some((r) => audience.roles.includes(r));
  }
  return false;
}
