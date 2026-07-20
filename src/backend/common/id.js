import { randomBytes } from 'node:crypto';

/**
 * Módulo de generación de identificadores únicos.
 * Provee la función {@link uuidv7} para generar UUID versión 7 ordenables temporalmente,
 * basados en timestamp de milisegundos y componente aleatorio.
 *
 * @module id
 */

/**
 * Genera un UUID v7 (48-bit timestamp ms + aleatorio) ordenable temporalmente.
 * Cumple con el estándar de variante RFC 4122.
 * 
 * @returns {string} Identificador único en formato UUID v7 de 36 caracteres.
 * @example
 * uuidv7() // Devuelve '018f3a6e-1b2c-7d4e-8f90-123456789abc'
 */
export function uuidv7() {
  const bytes = randomBytes(16);
  let t = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // versión 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
