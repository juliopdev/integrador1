/**
 * Registro CENTRALIZADO de estrategias de Passport (kernel/bootstrap/).
 *
 * Separación de responsabilidades:
 * - `plugins/passport.js` monta la INFRAESTRUCTURA (@fastify/passport + @fastify/secure-session
 *   para la cookie transitoria del handshake OAuth). Es plugin: tecnología, se registra una vez.
 * - Este módulo registra las ESTRATEGIAS concretas (`passport-local`, `passport-google-oauth20`)
 *   cuando un flujo las adopte. Es bootstrap: composición de negocio.
 *
 * Estado actual: NINGÚN flujo usa estrategias passport todavía —
 * - `local` (email+password de Superadmin/Master/Staff/User) se maneja con use cases propios
 *   (`login.usecase.js` + `verifySecret`), sin middleware passport.
 * - Google OAuth usa `google-oauth.adapter.js` con handlers manuales initiate/callback/exchange,
 *   por la restricción de `redirect_uri` único de Google Cloud (callback en apex + ticket de
 *   intercambio en subdominio) — un strategy estándar no soporta ese split.
 *
 * Cuando un flujo migre a estrategia passport, se registra AQUÍ (único punto), p. ej.:
 *   fastifyPassport.use('local', new LocalStrategy(...));
 *
 * Ver .doc/tree/src/backend/kernel.md y .doc/rules/security.md.
 */
/**
 * Punto de extensión para el registro centralizado de estrategias de Passport.
 * Actualmente vacío (ver el doc-comment del módulo). Cuando un flujo migre a estrategia passport,
 * se registra aquí como único punto de composición.
 */
export function registerPassportStrategies(/* app */) {
  // Punto de extensión deliberadamente vacío — ver doc-comment.
}
