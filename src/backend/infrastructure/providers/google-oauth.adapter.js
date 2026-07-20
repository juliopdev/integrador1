import { AppError } from '../../common/errors.js';

// Adapter para Google OAuth 2.0 / OpenID Connect. Tres funciones puras que envuelven las URLs de
// Google y aíslan el acceso a `fetch` para tests. Ver `.doc/tree/.../auth-user.md` "oauth-login".
//
// Endpoints:
//  - Authorize (browser redirect): https://accounts.google.com/o/oauth2/v2/auth
//  - Token exchange (server POST): https://oauth2.googleapis.com/token
//  - Userinfo (server GET):        https://openidconnect.googleapis.com/v1/userinfo
//
// El adapter NO conoce el `redirect_uri` — lo recibe por parámetro. Esto permite reusarlo tanto
// en dev (apex callback) como en prod (subdominio si Google acepta el dominio del tenant).

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL     = 'https://oauth2.googleapis.com/token';
const USERINFO_URL  = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * Fábrica del adapter. Permite inyectar `fetchImpl` (útil en tests para trazar sin `vi.stubGlobal`).
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export function createGoogleOAuthAdapter({ fetchImpl } = {}) {
  const doFetch = fetchImpl ?? ((...args) => fetch(...args));

  return {
    /**
     * Construye el URL de autorización al que redirigimos el browser del usuario. Devuelve el URL
     * final listo para un `reply.redirect(302, url)`. No hace I/O.
     *
     * @param {{ clientId: string, redirectUri: string, state: string, scopes: string[] }} params - Parámetros de autorización.
     * @param {string} params.clientId - Client ID de Google OAuth.
     * @param {string} params.redirectUri - URI de redirección post-autenticación.
     * @param {string} params.state - Estado CSRF para protección anti-forgery.
     * @param {string[]} params.scopes - Lista de scopes OIDC solicitados.
     * @returns {string} URL de autorización completa para redirección del browser.
     */
    buildAuthorizeUrl({ clientId, redirectUri, state, scopes }) {
      const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        state,
        access_type: 'online',       // no queremos refresh_token — la app es browser-first
        prompt: 'select_account',    // fuerza el picker de cuenta para evitar reuso silencioso
      });
      return `${AUTHORIZE_URL}?${query.toString()}`;
    },

    /**
     * Cambia el `code` recibido en el callback por un access token (y opcionalmente id token).
     * Server-side. Devuelve `{ accessToken, idToken }` (idToken puede ser undefined si el scope
     * no incluye 'openid').
     *
     * @param {{ clientId: string, clientSecret: string, code: string, redirectUri: string }} params - Parámetros del exchange.
     * @param {string} params.clientId - Client ID de Google OAuth.
     * @param {string} params.clientSecret - Client Secret de Google OAuth.
     * @param {string} params.code - Código de autorización recibido del callback.
     * @param {string} params.redirectUri - URI de redirección (debe coincidir con la del authorize).
     * @returns {Promise<{ accessToken: string, idToken?: string }>} Tokens de acceso e ID token opcional.
     * @throws {AppError} Si el intercambio falla (502).
     */
    async exchangeCode({ clientId, clientSecret, code, redirectUri }) {
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });
      const res = await doFetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = payload?.error_description || payload?.error || `HTTP ${res.status}`;
        throw new AppError(502, 'OAUTH_TOKEN_EXCHANGE_FAILED', `Google token exchange failed: ${errMsg}`);
      }
      return { accessToken: payload.access_token, idToken: payload.id_token };
    },

    /**
     * Obtiene el perfil OIDC (`sub`, `email`, `name`, `picture`, `email_verified`) usando el
     * access token del paso previo. Devuelve solo `sub`, `email`, `name` (lo que necesita el
     * upsert; el resto se ignora para no persistir más de lo necesario).
     *
     * @param {string} accessToken - Access token obtenido de `exchangeCode`.
     * @returns {Promise<{ sub: string, email: string, name: string }>} Perfil básico del usuario OIDC.
     * @throws {AppError} Si la consulta del perfil falla (502).
     */
    async fetchUserInfo(accessToken) {
      const res = await doFetch(USERINFO_URL, {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = payload?.error_description || payload?.error || `HTTP ${res.status}`;
        throw new AppError(502, 'OAUTH_USERINFO_FAILED', `Google userinfo failed: ${errMsg}`);
      }
      return { sub: payload.sub, email: payload.email, name: payload.name };
    },
  };
}
