import { registerSchema, loginSchema, forgotPassSchema, resetPassSchema } from '../validators/in.schema.js';
import { registerResultSchema, loginResultSchema, refreshResultSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';
import { signAccessToken } from '../../../../common/jwt.js';
import { env } from '../../../../config/env.js';

/**
 * Cookie de end-user host-only (sin atributo Domain): solo el subdominio exacto la reenvía. Vive
 * lo que el refresh (7 días); el access token JWT es de 15 min y viaja en `data.accessToken`.
 * @returns {{ httpOnly: boolean, secure: boolean, sameSite: string, path: string, maxAge: number }}
 */
function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  };
}

/**
 * Rutas API headless de end-user bajo `/api/:version/auth/*`. Solo tiene sentido en subdominio
 * de tenant (el `request.tenant` lo resuelve el hook global `tenant-loader`). En apex responden
 * 404 (no hay tenant contra el cual autenticarse).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   makeRegisterFor: (request: object) => Function,
 *   makeLoginFor: (request: object) => Function,
 *   makeForgotPassFor?: (request: object) => Function,
 *   makeResetPassFor?: (request: object) => Function,
 *   session: { create: Function, get: Function, destroy: Function },
 *   onRefreshSuccess?: (request: object, session: { userId: string, email: string }) => Promise<void>,
 * }} deps
 *
 * `onRefreshSuccess` es opcional — permite ejecutar side-effects al renovar la sesión (self-heal
 * de estado derivado del usuario, ej. sincronizar `users_db` del contrato No-Code para tenants
 * cuyo usuario fue creado antes de que la tabla existiera). Debe ser best-effort (no debe fallar
 * el refresh si tira excepción).
 */
export function registerAuthUserRoutes(app, { makeRegisterFor, makeLoginFor, makeForgotPassFor, makeResetPassFor, session, onRefreshSuccess }) {
  const requireTenantContext = (request, reply) => {
    if (!request.tenant) {
      reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Ruta no encontrada.'));
      return false;
    }
    return true;
  };

  // POST /api/:version/auth/register — auto-registro. Retorna { userId, email } sin sesión (el
  // cliente hace login a continuación) para respetar la separación registro/login del doc.
  app.post('/api/:version/auth/register', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    const parsed = registerSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(
        errorBody(400, 'VALIDATION_ERROR', 'Email y password (≥8) son requeridos.', parsed.error.flatten().fieldErrors)
      );
    }
    const created = await makeRegisterFor(request)(parsed.data); // DomainError → mapeador global
    return reply.code(201).send(successBody(serialize(registerResultSchema, created)));
  });

  // POST /api/:version/auth/login — login local (sin passphrase). Emite JWT scope='user' + cookie.
  app.post('/api/:version/auth/login', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    const parsed = loginSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(
        errorBody(400, 'VALIDATION_ERROR', 'Email y password son requeridos.', parsed.error.flatten().fieldErrors)
      );
    }
    const user = await makeLoginFor(request)(parsed.data); // AuthError → mapeador global

    const sessionId = await session.create({
      userId: user.userId, email: user.email, scope: 'user', tenantId: request.tenant.id,
    });
    reply.setCookie('user_sid', sessionId, sessionCookieOptions());
    const accessToken = signAccessToken({
      sub: user.userId, email: user.email, scope: 'user', tenantId: request.tenant.id,
    });
    return reply.code(200).send(successBody(serialize(loginResultSchema, { accessToken })));
  });

  // POST /api/:version/auth/refresh — emite un nuevo access token si la sesión sigue viva en
  // Valkey y corresponde al contexto (scope='user' + tenantId del subdominio actual, anti
  // cross-tenant). No rota el `sessionId`: el cliente sigue con la misma cookie.
  app.post('/api/:version/auth/refresh', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    const sessionData = await session.get(request.cookies?.user_sid);
    if (!sessionData || sessionData.scope !== 'user' || sessionData.tenantId !== request.tenant.id) {
      return reply.code(401).send(errorBody(401, 'INVALID_SESSION', 'Sesión inválida o expirada.'));
    }
    const accessToken = signAccessToken({
      sub: sessionData.userId, email: sessionData.email, scope: 'user', tenantId: request.tenant.id,
    });
    // Self-heal opcional (best-effort, no rompe el refresh): permite que el composition-root
    // sincronice estado derivado del user cada vez que renueva sesión — útil para tenants cuyo
    // `users_db` del contrato No-Code cambió después de que el user fue creado. Idempotente.
    if (onRefreshSuccess) {
      try {
        await onRefreshSuccess(request, { userId: sessionData.userId, email: sessionData.email });
      } catch (err) {
        request.log.error({ err }, 'onRefreshSuccess falló (no bloquea refresh)');
      }
    }
    return reply.send(successBody(serialize(refreshResultSchema, { accessToken })));
  });

  // POST /api/:version/auth/logout — revoca la sesión (borra de Valkey) y limpia la cookie.
  // Idempotente: sin cookie → 200 igualmente.
  app.post('/api/:version/auth/logout', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    await session.destroy(request.cookies?.user_sid);
    reply.clearCookie('user_sid', { path: '/' });
    return reply.send(successBody(null));
  });

  // POST /api/:version/auth/forgot-pass — solicita el reset. **Siempre 200 vacío** (anti-
  // enumeración de cuentas). El correo llega solo si el email existe y el user está activo.
  app.post('/api/:version/auth/forgot-pass', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    if (!makeForgotPassFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La recuperación de contraseña aún no está cableada.'));
    }
    const parsed = forgotPassSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(
        errorBody(400, 'VALIDATION_ERROR', 'email válido es requerido.', parsed.error.flatten().fieldErrors)
      );
    }
    // NO devolvemos el rawToken al cliente HTTP — solo se persiste hash + viaja en el correo.
    await makeForgotPassFor(request)(parsed.data);
    return reply.send(successBody(null));
  });

  // POST /api/:version/auth/reset-pass — consume el token y setea nueva password.
  app.post('/api/:version/auth/reset-pass', async (request, reply) => {
    if (!requireTenantContext(request, reply)) return reply;
    if (!makeResetPassFor) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La recuperación de contraseña aún no está cableada.'));
    }
    const parsed = resetPassSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(
        errorBody(400, 'VALIDATION_ERROR', 'token y password (≥8) son requeridos.', parsed.error.flatten().fieldErrors)
      );
    }
    await makeResetPassFor(request)(parsed.data); // AuthError/DomainError → global mapper
    return reply.send(successBody(null));
  });
}
