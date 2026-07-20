import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * Módulo de hashing y verificación de contraseñas.
 * Provee las funciones {@link hashSecret} y {@link verifySecret} utilizando bcryptjs
 * con salt rounds configurables según el entorno (10 en producción, 1 en test).
 * Implementa protección contra timing attacks mediante hash dummy para usuarios sin contraseña.
 *
 * @module password
 */

// Hashing de contraseñas/passphrases con bcryptjs. Salt rounds 10 (1 en test para acelerar).
// Ver .doc/rules/security.md.
const ROUNDS = env.NODE_ENV === 'test' ? 1 : 10;

// Hash dummy de formato válido: permite que verifySecret compare en tiempo constante
// aunque el usuario no tenga password (evita fuga de tiempos / enumeración de cuentas).
const DUMMY_HASH = bcrypt.hashSync('__dummy__', ROUNDS);

/**
 * Hashea una contraseña o frase de acceso mediante bcrypt.
 * 
 * @param {string} plain - Contraseña en texto plano a cifrar.
 * @returns {Promise<string>} El hash de contraseña generado.
 * @example
 * const hash = await hashSecret('mySecureP@ss');
 * // hash => '$2a$10$...'
 */
export async function hashSecret(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

/**
 * Verifica si una contraseña en texto plano coincide con el hash almacenado.
 * Implementa una comprobación de tiempo constante contra un hash ficticio en caso de que el
 * usuario consultado no tenga contraseña, protegiendo al sistema contra fuga de tiempos.
 * 
 * @param {string} plain - Contraseña en texto plano a verificar.
 * @param {string|null|undefined} hash - Hash guardado en base de datos.
 * @returns {Promise<boolean>} `true` si la contraseña coincide con el hash, de lo contrario `false`.
 * @example
 * const match = await verifySecret('mySecureP@ss', storedHash);
 * // match => true
 */
export async function verifySecret(plain, hash) {
  return bcrypt.compare(plain, hash || DUMMY_HASH);
}
