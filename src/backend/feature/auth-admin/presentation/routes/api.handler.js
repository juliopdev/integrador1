import { activateSchema, loginSchema, forgotPassSchema, resetPassSchema } from '../validators/in.schema.js';
import { loginResultSchema, refreshResultSchema, meResultSchema } from '../validators/out.schema.js';
import { errorBody, successBody, serialize } from '../../../../common/responses.js';
import { signAccessToken } from '../../../../common/jwt.js';
import { env } from '../../../../config/env.js';

/**
 * Cookie de sesión host-only (sin atributo Domain): solo el host exacto la reenvía, evitando que un
 * subdominio de tenant reciba la cookie del apex (security.md). Lleva el `sessionId` (no el JWT)
 * y vive lo que el refresh (7 días); el access token JWT es de 15 min y viaja en el body / Bearer.
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
 * Construye los claims estándar para el access token JWT según el contexto.
 * @param {string} userId - ID del usuario autenticado.
 * @param {string} email - Correo del usuario autenticado.
 * @param {{ scope: string, tenantId?: string }} ctx - Contexto de la petición.
 * @returns {{ sub: string, email: string, scope: string, tenantId?: string }}
 */
function accessClaims(userId, email, ctx) {
  const claims = { sub: userId, email, scope: ctx.scope };
  if (ctx.tenantId) claims.tenantId = ctx.tenantId;
  return claims;
}

/**
 * Registra las rutas API de auth-admin bajo `/api-system/v1/*`. Sirven **dos contextos** —
 * Superadmin (apex) y Master/Staff (subdominio) — vía `resolveContext(request)`, que devuelve por
 * petición el repo, la cookie (`platform_sid`/`tenant_sid`), el ámbito y los casos de uso correctos
 * según `request.tenant`. Respuestas: éxito `{ data }`; error `{ statusCode, error, code, message }`.
 * Ver flows.md, security.md y la memoria api-system-scope-rule.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ resolveContext: (request: object) => { scope: string, cookieName: string, tenantId: string|null, registerAdminCredentials: Function, login: Function, forgotPass?: Function, resetPass?: Function }, session: { create: Function, get: Function, destroy: Function } }} deps
 */
export function registerAuthAdminRoutes(app, { resolveContext, session }) {
  app.post('/api-system/v1/login', async (request, reply) => {
    const ctx = resolveContext(request);
    const body = request.body ?? {};

    // Rama de activación: hay token → registrar credenciales por única vez.
    if (body.token) {
      const parsed = activateSchema.safeParse(body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send(errorBody(400, 'VALIDATION_ERROR', 'Datos de activación inválidos (password ≥8, passphrase ≥12).'));
      }
      const { token, password, passphrase } = parsed.data;
      await ctx.registerAdminCredentials({ rawToken: token, password, passphrase }); // DomainError → manejador global
      return reply.code(200).send(successBody(null));
    }

    // Rama de login estándar (doble factor).
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'Email, password y passphrase son requeridos.'));
    }
    const user = await ctx.login(parsed.data); // AuthError → 401 vía manejador global

    const sessionId = await session.create({ userId: user.userId, email: user.email, scope: ctx.scope, tenantId: ctx.tenantId });
    reply.setCookie(ctx.cookieName, sessionId, sessionCookieOptions());
    const accessToken = signAccessToken(accessClaims(user.userId, user.email, ctx));
    return reply.code(200).send(successBody(serialize(loginResultSchema, { accessToken })));
  });

  // Renueva el access token si la sesión sigue viva en Valkey y corresponde al contexto.
  app.post('/api-system/v1/refresh', async (request, reply) => {
    const ctx = resolveContext(request);
    const sessionData = await session.get(request.cookies?.[ctx.cookieName]);
    if (!sessionData || sessionData.scope !== ctx.scope || sessionData.tenantId !== ctx.tenantId) {
      return reply.code(401).send(errorBody(401, 'INVALID_SESSION', 'Sesión inválida o expirada.'));
    }
    const accessToken = signAccessToken(accessClaims(sessionData.userId, sessionData.email, ctx));
    return reply.send(successBody(serialize(refreshResultSchema, { accessToken })));
  });

  // Revoca la sesión (borra de Valkey) y limpia la cookie del contexto.
  app.post('/api-system/v1/logout', async (request, reply) => {
    const ctx = resolveContext(request);
    await session.destroy(request.cookies?.[ctx.cookieName]);
    reply.clearCookie(ctx.cookieName, { path: '/' });
    return reply.send(successBody(null));
  });

  // Perfil de la sesión activa (flows.md). `request.user` lo hidrata el hook session-auth.
  app.get('/api-system/v1/me', async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send(errorBody(401, 'UNAUTHENTICATED', 'No autenticado.'));
    }
    return reply.send(successBody(serialize(meResultSchema, request.user)));
  });

  // POST /api-system/v1/forgot-pass — solicita reset. **Siempre 200 vacío** (anti-enumeración).
  // El correo llega solo si el admin existe y está activo. Contexto (apex vs subdominio) resuelto
  // por request.tenant → el use case emite la URL correcta (apex o `<sub>.<apex>`).
  app.post('/api-system/v1/forgot-pass', async (request, reply) => {
    const ctx = resolveContext(request);
    if (!ctx.forgotPass) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La recuperación de contraseña aún no está cableada.'));
    }
    const parsed = forgotPassSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'email válido es requerido.', parsed.error.flatten().fieldErrors));
    }
    await ctx.forgotPass(parsed.data); // el rawToken NO viaja al cliente HTTP
    return reply.send(successBody(null));
  });

  // POST /api-system/v1/reset-pass — consume token y actualiza sólo password (la passphrase no
  // se toca — sigue siendo un doble factor persistente). AuthError/DomainError → mapeador global.
  app.post('/api-system/v1/reset-pass', async (request, reply) => {
    const ctx = resolveContext(request);
    if (!ctx.resetPass) {
      return reply.code(501).send(errorBody(501, 'NOT_IMPLEMENTED', 'La recuperación de contraseña aún no está cableada.'));
    }
    const parsed = resetPassSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'token y password (≥8) son requeridos.', parsed.error.flatten().fieldErrors));
    }
    await ctx.resetPass(parsed.data);
    return reply.send(successBody(null));
  });
}
