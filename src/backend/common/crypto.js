import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Módulo de cifrado simétrico autenticado mediante AES-256-GCM.
 * Provee las funciones {@link encrypt} y {@link decrypt} para proteger credenciales
 * de terceros almacenadas en la configuración de proveedores del tenant, utilizando
 * una clave maestra de 32 bytes configurada vía variable de entorno.
 *
 * @module crypto
 */

// Cifrado simétrico autenticado AES-256-GCM para credenciales de terceros del tenant
// (`tenant_providers.config_values_json`). Ver .doc/rules/security.md.
const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(env.ENCRYPTION_MASTER_KEY, 'hex'); // 32 bytes (64 hex)

/**
 * @typedef {Object} EncryptedPayload
 * @property {string} ciphertext - Texto cifrado codificado en hexadecimal.
 * @property {string} iv - Vector de inicialización (IV) de 12 bytes codificado en hexadecimal.
 * @property {string} tag - Tag de autenticación GCM de 16 bytes codificado en hexadecimal.
 */

/**
 * Cifra un texto plano utilizando algoritmo AES-256-GCM y clave maestra.
 * Genera un vector de inicialización único por cada operación de cifrado.
 * 
 * @param {string} plaintext - Texto plano a cifrar.
 * @returns {EncryptedPayload} Objeto contenedor del resultado cifrado.
 * @example
 * const encrypted = encrypt('api_key_secret');
 * // encrypted => { ciphertext: 'ab12...', iv: 'cd34...', tag: 'ef56...' }
 */
export function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

/**
 * Descifra un payload cifrado y verifica su integridad a través del tag de autenticación.
 * 
 * @param {EncryptedPayload} payload - Estructura cifrada en formato hexadecimal.
 * @returns {string} El texto plano original descifrado.
 * @throws {Error} Si los datos han sido alterados o la autenticación del tag falla.
 * @example
 * const plain = decrypt({ ciphertext: 'ab12...', iv: 'cd34...', tag: 'ef56...' });
 * // plain => 'api_key_secret'
 */
export function decrypt({ ciphertext, iv, tag }) {
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
