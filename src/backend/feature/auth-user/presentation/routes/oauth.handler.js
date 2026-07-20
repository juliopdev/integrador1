/**
 * Rutas de autenticación OAuth (Google) para end-users. Bridge entre el callback en apex
 * (`/auth/google/callback`) y el subdominio del tenant via ticket firmado (`/auth/exchange`).
 * @module oauth.handler
 */

import { errorBody } from '../../../../common/responses.js';
import { signOAuthState, verifyOAuthState, signOAuthTicket, verifyOAuthTicket } from '../../infrastructure/oauth-tickets.js';
import { randomBytes } from 'node:crypto';

/**
 * URI del callback en apex — Google solo acepta un `redirect_uri` público por app. En dev con
 * `.localhost`, el subdominio no es aceptado por Google Cloud, así que registramos el callback en
 * el apex y bridgeamos al subdominio via ticket (`/auth/exchange`).
 *
 * @param {string} appUrl - URL base de la aplicación.
 * @returns {string} URL absoluta del callback de Google.
 * @example
 * apexCallbackUrl('https://app.example.com')
 * // 'https://app.example.com/auth/google/callback'
 */
export function apexCallbackUrl(appUrl) {
  return `${appUrl.replace(/\/+$/, '')}/auth/google/callback`;
}

/**
 * Cookie del end-user (host-only para no cruzar subdominios; misma disciplina que en login local).
 * @param {{ secure: boolean }} opts - Opciones de configuración.
 * @param {boolean} opts.secure - Indica si la cookie debe usar Secure flag (HTTPS).
 * @returns {{ httpOnly: boolean, secure: boolean, sameSite: string, path: string, maxAge: number }}
 */
function userSessionCookieOpts({ secure }) {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 };
}

/**
 * Fábrica del handler `GET /auth/google` — corre en subdominio del tenant. Requiere:
 *  1. `request.tenant` (lo setea tenant-loader).
 *  2. Contrato publicado con `google` en `auth.strategies`.
 *  3. `tenant_providers` linkeado con category=auth provider=google.
 *
 * Firma un `state` JWT y redirige al authorize URL de Google.
 *
 * @param {Object} deps - Dependencias del handler.
 * @param {Object} deps.googleAdapter - Adaptador de Google OAuth.
 * @param {Function} deps.providerLookup - Obtiene la configuración del proveedor del tenant.
 * @param {Function} deps.contractLookup - Obtiene el contrato publicado del tenant.
 * @param {string} deps.appUrl - URL base de la aplicación.
 * @param {string} [deps.redirectUriOverride] - URI de redirección override para Google.
 * @returns {(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>}
 */
export function makeGoogleInitiate({ googleAdapter, providerLookup, contractLookup, appUrl, redirectUriOverride }) {
  /**
   * Inicia el flujo OAuth con Google.
   * Verifica tenant, contrato y proveedor, firma un state JWT y redirige al authorize URL.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   */
  return async function initiate(request, reply) {
    if (!request.tenant) {
      return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Ruta no encontrada.'));
    }

    // El contrato debe estar publicado y `google` habilitado como strategy.
    const contract = contractLookup(request);
    const strategies = contract?.schema?.auth?.strategies || [];
    if (!strategies.includes('google')) {
      return reply.code(403).send(errorBody(403, 'STRATEGY_DISABLED', 'La estrategia google no está habilitada en este tenant.'));
    }

    // Provider linkeado (creds Google) del tenant.
    const providerConfig = providerLookup(request);
    if (!providerConfig) {
      return reply.code(503).send(errorBody(503, 'PROVIDER_NOT_LINKED', 'Falta linkear el proveedor auth/google.'));
    }

    const returnTo = validateReturnTo(request.query?.returnTo);
    const nonce = randomBytes(16).toString('hex');
    const state = signOAuthState({ tenantId: request.tenant.id, returnTo, nonce });

    const url = googleAdapter.buildAuthorizeUrl({
      clientId: providerConfig.clientId,
      redirectUri: redirectUriOverride ?? apexCallbackUrl(appUrl),
      state,
      scopes: ['openid', 'email', 'profile'],
    });
    return reply.redirect(url);
  };
}

/**
 * Fábrica del handler `GET /auth/google/callback` — corre en apex. Verifica state, intercambia code,
 * upsertea user en la BD del tenant identificado por el state, firma ticket y redirige al subdominio.
 *
 * @param {Object} deps - Dependencias del handler.
 * @param {Object} deps.googleAdapter - Adaptador de Google OAuth.
 * @param {Function} deps.getTenantById - Obtiene un tenant por su ID.
 * @param {Function} deps.providerLookupById - Obtiene la configuración del proveedor por ID de tenant.
 * @param {(tenantId: string) => Function} deps.oauthLoginFor - Factory de caso de uso OAuth login para un tenant.
 * @param {string} deps.appUrl - URL base de la aplicación.
 * @param {string} [deps.redirectUriOverride] - URI de redirección override para Google.
 * @returns {(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>}
 */
export function makeGoogleCallback({ googleAdapter, getTenantById, providerLookupById, oauthLoginFor, appUrl, redirectUriOverride }) {
  /**
   * Procesa el callback de Google OAuth.
   * Verifica el state, intercambia el code por token, obtiene el perfil del usuario,
   * realiza upsert del usuario en el tenant y redirige al subdominio con un ticket JWT.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   */
  return async function callback(request, reply) {
    const { code, state, error: googleError } = request.query || {};
    if (googleError) {
      return reply.code(400).send(errorBody(400, 'OAUTH_ERROR', `Google devolvió: ${googleError}`));
    }
    if (!code || !state) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'code y state son requeridos.'));
    }

    let decoded;
    try { decoded = verifyOAuthState(state); }
    catch { return reply.code(400).send(errorBody(400, 'INVALID_STATE', 'state inválido o expirado.')); }

    let tenant;
    try {
      tenant = await getTenantById({ tenantId: decoded.tenantId });
    } catch {
      return reply.code(404).send(errorBody(404, 'TENANT_NOT_FOUND', 'El tenant del state no existe.'));
    }

    const providerConfig = providerLookupById(tenant.id);
    if (!providerConfig) {
      return reply.code(503).send(errorBody(503, 'PROVIDER_NOT_LINKED', 'Falta linkear el proveedor auth/google.'));
    }

    // Exchange code → access_token → userinfo. Los errores de Google se propagan como 502.
    let tokens, profile;
    try {
      tokens = await googleAdapter.exchangeCode({
        clientId: providerConfig.clientId,
        clientSecret: providerConfig.clientSecret,
        code,
        redirectUri: redirectUriOverride ?? apexCallbackUrl(appUrl),
      });
      profile = await googleAdapter.fetchUserInfo(tokens.accessToken);
    } catch (err) {
      return reply.code(502).send(errorBody(502, 'OAUTH_UPSTREAM_ERROR', err?.message || 'Error contra Google.'));
    }

    // Upsert user en la BD del tenant identificado en el state.
    const { userId, email } = await oauthLoginFor(tenant.id)({ authProvider: 'google', profile });

    // Ticket JWT (30s) para el bridge apex → subdominio.
    const ticket = signOAuthTicket({ userId, email, tenantId: tenant.id, returnTo: decoded.returnTo });
    const subdomainBase = buildSubdomainBase(appUrl, tenant.subdomain);
    return reply.redirect(`${subdomainBase}/auth/exchange?ticket=${encodeURIComponent(ticket)}`);
  };
}

/**
 * Fábrica del handler `GET /auth/exchange` — corre en subdominio. Verifica ticket, crea sesión +
 * cookie `user_sid`, redirige a `returnTo` (default `/`).
 *
 * @param {Object} deps - Dependencias del handler.
 * @param {string} deps.appUrl - URL base de la aplicación.
 * @param {Function} deps.createSession - Función para crear una sesión en Valkey.
 * @returns {(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>}
 */
export function makeGoogleExchange({ appUrl, createSession }) {
  /**
   * Intercambia un ticket OAuth por una sesión.
   * Verifica el ticket, valida que corresponda al subdominio actual, crea la sesión
   * y redirige al returnTo original.
   * @param {import('fastify').FastifyRequest} request
   * @param {import('fastify').FastifyReply} reply
   */
  return async function exchange(request, reply) {
    if (!request.tenant) {
      return reply.code(404).send(errorBody(404, 'NOT_FOUND', 'Ruta no encontrada.'));
    }
    const { ticket } = request.query || {};
    if (!ticket) {
      return reply.code(400).send(errorBody(400, 'VALIDATION_ERROR', 'ticket es requerido.'));
    }
    let decoded;
    try { decoded = verifyOAuthTicket(ticket); }
    catch { return reply.code(400).send(errorBody(400, 'INVALID_TICKET', 'ticket inválido o expirado.')); }

    // Anti cross-tenant: el ticket viene con `tenantId`, debe coincidir con el subdominio actual.
    if (decoded.tenantId !== request.tenant.id) {
      return reply.code(403).send(errorBody(403, 'TENANT_MISMATCH', 'El ticket no corresponde a este subdominio.'));
    }

    const sessionId = await createSession({
      userId: decoded.userId, email: decoded.email, scope: 'user', tenantId: request.tenant.id,
    });
    const secure = /^https:/i.test(appUrl);
    reply.setCookie('user_sid', sessionId, userSessionCookieOpts({ secure }));
    return reply.redirect(validateReturnTo(decoded.returnTo));
  };
}

/**
 * Valida que `returnTo` sea un path relativo seguro (empieza con "/" y no es "//" protocolo-relativo).
 * @param {string} raw - URL a validar.
 * @returns {string} Path validado o "/" por defecto si es inseguro.
 */
function validateReturnTo(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/**
 * Reconstruye el URL del subdominio a partir del APP_URL apex.
 * `APP_URL=http://localhost:3000` + `subdomain=shop` → `http://shop.localhost:3000`.
 * @param {string} appUrl - URL base de la aplicación (apex).
 * @param {string} subdomain - Subdominio del tenant.
 * @returns {string} URL completa del subdominio.
 * @example
 * buildSubdomainBase('http://localhost:3000', 'shop')
 * // 'http://shop.localhost:3000'
 */
function buildSubdomainBase(appUrl, subdomain) {
  const u = new URL(appUrl);
  const hostWithPort = u.port ? `${subdomain}.${u.hostname}:${u.port}` : `${subdomain}.${u.hostname}`;
  return `${u.protocol}//${hostWithPort}`;
}
