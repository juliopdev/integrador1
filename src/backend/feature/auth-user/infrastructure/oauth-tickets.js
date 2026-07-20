import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';

// Tickets JWT de vida ULTRA CORTA usados por el flujo OAuth (auth-user, Iteration 26).
// Reusan `JWT_SECRET` pero se distinguen del `access_token` estándar mediante el claim `typ`, lo
// que impide reuso cruzado (un `state` no puede pasar por `ticket` ni viceversa). Ver security.md.
//
// **state** (subdominio /auth/google → apex /auth/google/callback)
//   TTL 5 minutos. Payload: { tenantId, returnTo, nonce }. Firmado por el subdominio, verificado por
//   el apex — evita CSRF y ata la petición a un tenant específico.
//
// **ticket** (apex callback → subdominio /auth/exchange)
//   TTL 30 segundos. Payload: { userId, email, tenantId, returnTo }. Firmado por el apex tras
//   procesar el login OAuth; el subdominio lo verifica y crea la sesión + cookie.

const STATE_TTL = '5m';
const TICKET_TTL = '30s';
const TYP_STATE = 'oauth_state';
const TYP_TICKET = 'oauth_ticket';

/**
 * @typedef {Object} OAuthStatePayload
 * @property {string} tenantId - Identificador único del tenant en SQLite.
 * @property {string} returnTo - URL de retorno del cliente después de autenticarse.
 * @property {string} nonce - Código único aleatorio de seguridad para evitar ataques CSRF.
 */

/**
 * @typedef {Object} OAuthTicketPayload
 * @property {string} userId - Identificador único del usuario autenticado.
 * @property {string} email - Correo del usuario autenticado.
 * @property {string} tenantId - Identificador único del tenant en SQLite.
 * @property {string} returnTo - URL a redireccionar después de completar la autenticación.
 */

/**
 * Firma interna de tokens JWT para el flujo OAuth.
 * 
 * @param {Object} payload - Información a almacenar.
 * @param {string} typ - Tipo distintivo de token ('oauth_state' | 'oauth_ticket').
 * @param {string} ttl - Tiempo de vida del token (ej: '5m', '30s').
 * @returns {string} Token JWT firmado.
 */
function sign(payload, typ, ttl) {
  return jwt.sign({ ...payload, typ }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: ttl });
}

/**
 * Verifica internamente un token JWT y valida que el tipo ('typ') corresponda al esperado.
 * 
 * @param {string} token - Token JWT recibido.
 * @param {string} expectedTyp - Tipo que debe tener el token.
 * @returns {Object} Payload decodificado del token.
 * @throws {Error} Si la verificación falla o si hay discrepancia en el tipo de token.
 */
function verify(token, expectedTyp) {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (decoded?.typ !== expectedTyp) {
    throw new Error(`Ticket typ mismatch: expected ${expectedTyp}, got ${decoded?.typ}`);
  }
  return decoded;
}

/**
 * Firma un state JWT para prevenir ataques CSRF al iniciar flujo OAuth.
 * 
 * @param {OAuthStatePayload} params
 * @returns {string} Token JWT firmado con TTL de 5 minutos.
 */
export function signOAuthState({ tenantId, returnTo, nonce }) {
  return sign({ tenantId, returnTo, nonce }, TYP_STATE, STATE_TTL);
}

/**
 * Verifica un token de state de OAuth y retorna el contenido decodificado.
 * 
 * @param {string} token - Token del state de OAuth.
 * @returns {OAuthStatePayload & jwt.JwtPayload} Payload decodificado.
 */
export function verifyOAuthState(token) {
  return verify(token, TYP_STATE);
}

/**
 * Firma un ticket JWT para intercambiar la sesión del apex al subdominio.
 * 
 * @param {OAuthTicketPayload} params
 * @returns {string} Token JWT firmado con TTL de 30 segundos.
 */
export function signOAuthTicket({ userId, email, tenantId, returnTo }) {
  return sign({ userId, email, tenantId, returnTo }, TYP_TICKET, TICKET_TTL);
}

/**
 * Verifica el ticket de intercambio de sesión OAuth de vida ultra corta y retorna su contenido.
 * 
 * @param {string} token - Token del ticket OAuth.
 * @returns {OAuthTicketPayload & jwt.JwtPayload} Payload decodificado.
 */
export function verifyOAuthTicket(token) {
  return verify(token, TYP_TICKET);
}
