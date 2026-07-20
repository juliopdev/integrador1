import { randomBytes, createHash } from 'node:crypto';

/**
 * Módulo de gestión de tokens de un solo uso.
 * Provee las funciones {@link generateToken} y {@link hashToken} para generar tokens
 * seguros (32 bytes aleatorios) para activación de cuentas, invitaciones y reseteo de
 * contraseñas. Solo el hash SHA-256 se persiste en base de datos; el valor crudo viaja
 * en el enlace enviado al usuario.
 *
 * @module token
 */

// Tokens de un solo uso (activación, invitación, reset de contraseña). Se persiste SOLO el hash
// SHA-256; el valor crudo solo viaja en el enlace enviado al usuario. Ver .doc/rules/security.md.

/**
 * @typedef {Object} SingleUseToken
 * @property {string} raw - El token crudo generado en formato hexadecimal, enviado al usuario (enlace).
 * @property {string} hash - El hash SHA-256 del token en formato hexadecimal, guardado en base de datos.
 */

/**
 * Genera un token seguro de un solo uso de 32 bytes en formato hexadecimal y su respectivo hash SHA-256.
 * 
 * @returns {SingleUseToken} Estructura con el token crudo y su hash persistible.
 * @example
 * const { raw, hash } = generateToken();
 * // raw => 'a1b2...' (enviar al usuario)
 * // hash => '3c4d...' (persistir en BD)
 */
export function generateToken() {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}

/**
 * Genera el hash SHA-256 de un token crudo codificado en hexadecimal.
 * Se utiliza para buscar o contrastar tokens almacenados de forma segura.
 * 
 * @param {string} raw - Token crudo recibido.
 * @returns {string} Hash hexadecimal SHA-256 resultante.
 * @example
 * hashToken('a1b2c3...') // Devuelve '3c4d5e...'
 */
export function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}
