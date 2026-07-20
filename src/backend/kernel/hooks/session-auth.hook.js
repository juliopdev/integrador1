import { verifyAccessToken } from '../../common/jwt.js';
import { getSession } from '../../infrastructure/providers/session.adapter.js';

/**
 * @typedef {Object} UserIdentity
 * @property {string} id - Identificador único de usuario.
 * @property {string} email - Correo electrónico del usuario.
 * @property {'platform'|'tenant'|'user'} scope - Ámbito de seguridad / rol genérico asignado en el token o sesión.
 * @property {string|null} tenantId - Identificador único del tenant, o null si pertenece al contexto global de plataforma.
 */

/**
 * Registra el hook `preValidation` en Fastify para la resolución e hidratación de sesiones.
 * Valida credenciales a través de token stateless (Authorization Bearer JWT) o stateful en caché (cookies de sesión de Valkey).
 * Si la autenticación es válida, decora la solicitud inyectando los datos en `request.user` para su posterior
 * validación mediante guards/RBAC en los controladores. No bloquea peticiones anónimas (delega a guards específicos).
 * 
 * Previene cross-tenant access comparando que el `tenantId` de la sesión/token coincida exactamente con `request.tenant.id`.
 * 
 * @param {import('fastify').FastifyInstance} app - Instancia del servidor Fastify.
 */
export function registerSessionAuth(app) {
  if (!app.hasRequestDecorator('user')) {
    app.decorateRequest('user', null);
  }

  app.addHook('preValidation', async (request) => {
    const tenant = request.tenant; // lo setea tenant-loader (Fase 3); en apex es undefined

    // Vía 1: access token JWT (stateless).
    const bearer = bearerToken(request);
    if (bearer) {
      let claims;
      try {
        claims = verifyAccessToken(bearer);
      } catch {
        return; // firma/expiración inválidas → no autenticado
      }
      if (!scopeAllowed(claims, tenant)) return;
      request.user = identityOf(claims.sub, claims);
      return;
    }

    // Vía 2: sessionId en cookie → sesión en Valkey (revocable). En un subdominio conviven dos
    // cookies de distinto scope: `tenant_sid` (Master/Staff, panel admin) y `user_sid` (end-user
    // headless). La resolución es AISLADA POR SUPERFICIE, no por orden de preferencia:
    //   - Superficie admin (`/dashboard`, `/api-system`): SÓLO `tenant_sid`. Nunca cae a `user_sid`.
    //     Sin este aislamiento, tras el logout del admin (se borra `tenant_sid`) una cookie
    //     `user_sid` remanente se resolvía como `request.user` scope 'user' en `/dashboard` → el
    //     handler no la reconoce como admin → 403 "ámbito desconocido" (bug reportado).
    //   - Superficie headless / tiempo real (`/api/*`, `/ws/*`): comportamiento previo intacto —
    //     `tenant_sid` (soporte Master/Staff) y `user_sid` (end-user), en ese orden.
    const path = request.url;
    const isAdminSurface = path.startsWith('/dashboard') || path.startsWith('/api-system');
    const candidates = tenant
      ? (isAdminSurface
          ? [{ name: 'tenant_sid', scope: 'tenant' }]
          : [{ name: 'tenant_sid', scope: 'tenant' }, { name: 'user_sid', scope: 'user' }])
      : [{ name: 'platform_sid', scope: 'platform' }];

    for (const { name, scope } of candidates) {
      const sessionId = request.cookies?.[name];
      if (!sessionId) continue;
      const session = await getSession(sessionId);
      if (!session || session.scope !== scope) continue;
      if (!scopeAllowed(session, tenant)) continue;
      request.user = identityOf(session.userId, session);
      return;
    }
  });
}

/**
 * Valida si el ámbito (scope) de la sesión o token coincide con el host donde se realiza la solicitud.
 * Evita accesos cruzados (cross-tenant) verificando que el ID del tenant asociado coincida con el tenant actual de la solicitud.
 * 
 * @param {Object} claims - Contenido de la sesión o JWT.
 * @param {Object|null} tenant - Tenant resuelto en la solicitud.
 * @returns {boolean} `true` si el scope es permitido y consistente con el host, de lo contrario `false`.
 */
function scopeAllowed(claims, tenant) {
  if (!tenant) return claims.scope === 'platform';
  if (claims.scope !== 'tenant' && claims.scope !== 'user') return false;
  return claims.tenantId === tenant.id;
}

/**
 * Mapea y normaliza los datos de sesión/token a una estructura de identidad del usuario común.
 * 
 * @param {string} id - Identificador de usuario.
 * @param {Object} src - Datos origen de la sesión o del JWT.
 * @returns {UserIdentity} Estructura normalizada de identidad de usuario.
 */
function identityOf(id, src) {
  return { id, email: src.email, scope: src.scope, tenantId: src.tenantId ?? null };
}

/**
 * Obtiene el token JWT del encabezado Authorization Bearer de la petición HTTP.
 * 
 * @param {import('fastify').FastifyRequest} request - Petición Fastify.
 * @returns {string|null} El token JWT en formato string, o null si no existe o es inválido.
 */
function bearerToken(request) {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}
