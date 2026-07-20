import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Módulo de gestión de tokens JWT.
 * Provee las funciones {@link signAccessToken} y {@link verifyAccessToken} para firmar
 * y verificar access tokens JWT con algoritmo HS256, utilizando la clave secreta
 * configurada vía variable de entorno JWT_SECRET.
 *
 * @module jwt
 */

// Firma/verificación de access tokens JWT (HS256). Ver .doc/rules/security.md.
// El access token es de corta duración (15 min); el refresh + sesión en Valkey se añaden aparte.
const ACCESS_TTL = '15m';

/**
 * @typedef {Object} JWTPayload
 * @property {string} sub - Identificador único del usuario (Subject).
 * @property {string} email - Correo del usuario.
 * @property {string} scope - Ámbito de permisos o rol asociado.
 * @property {string} [tenantId] - Identificador único del tenant en SQLite.
 */

/**
 * Firma un access token JWT con expiración corta (15 min) usando algoritmo HS256.
 * 
 * @param {JWTPayload} payload - Información de sesión del usuario.
 * @returns {string} El token JWT firmado.
 * @example
 * const token = signAccessToken({ sub: 'user_123', email: 'a@b.com', scope: 'admin' });
 * // token => 'eyJhbGciOiJIUzI1NiIs...'
 */
export function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: ACCESS_TTL });
}

/**
 * Verifica, decodifica y valida la firma de un access token JWT.
 * 
 * @param {string} token - Token JWT a verificar.
 * @returns {JWTPayload} El payload decodificado del JWT.
 * @throws {Error} Si el token expiró, la firma no es válida o está corrupto.
 * @example
 * const payload = verifyAccessToken('eyJhbGciOiJIUzI1NiIs...');
 * // payload => { sub: 'user_123', email: 'a@b.com', scope: 'admin', iat: ..., exp: ... }
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}
