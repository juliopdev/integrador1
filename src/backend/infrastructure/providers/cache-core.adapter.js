/**
 * @module cache-core.adapter
 * @description Conexión singleton a Valkey/Redis (ioredis). Valkey es dependencia dura del sistema:
 * sesiones, rate-limit y caché de resolución subdominio→tenant.
 * En test se usa ioredis-mock (in-memory) para aislar las pruebas funcionales sin un
 * Valkey real. Import dinámico para no requerir el mock en prod.
 */

import { env } from '../../config/env.js';
import { logger } from './logger.js';
const Redis = env.NODE_ENV === 'test'
  ? (await import('ioredis-mock')).default
  : (await import('ioredis')).default;

const valkey = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true, // db-pool.js llama a .connect() y verifica con ping antes de aceptar tráfico.
  retryStrategy(times) {
    if (times > 10) return null; // detener reintentos tras 10 fallos consecutivos
    return Math.min(times * 200, 5000);
  },
});

valkey.on('connect', () => logger.info('[valkey] conectado'));
valkey.on('error', (err) => logger.error({ err }, '[valkey] error'));
valkey.on('reconnecting', (ms) => logger.info({ ms }, '[valkey] reconectando'));

// ── Helpers de lectura/escritura ──────────────────────────────────────

/**
 * Obtiene el valor asociado a una clave como cadena de texto.
 * 
 * @param {string} key - Clave a consultar en Valkey.
 * @returns {Promise<string|null>} El valor de la clave, o `null` si no existe.
 */
export async function get(key) {
  return valkey.get(key);
}

/**
 * Guarda un valor de texto asociado a una clave, con opción de definir un tiempo de expiración (TTL).
 * 
 * @param {string} key - Clave a registrar.
 * @param {string} value - Valor de texto a almacenar.
 * @param {number} [ttlSeconds] - Tiempo de expiración opcional en segundos.
 * @returns {Promise<'OK'|null>} Confirmación del almacenamiento.
 */
export async function set(key, value, ttlSeconds) {
  if (ttlSeconds) return valkey.set(key, value, 'EX', ttlSeconds);
  return valkey.set(key, value);
}

/**
 * Elimina una o más claves registradas en Valkey de forma simultánea.
 * 
 * @param {...string} keys - Lista de una o más claves a eliminar.
 * @returns {Promise<number>} Cantidad de claves efectivamente eliminadas.
 */
export async function del(...keys) {
  return valkey.del(...keys);
}

/**
 * Verifica si una clave específica existe dentro de Valkey.
 * 
 * @param {string} key - Clave a verificar.
 * @returns {Promise<number>} `1` si existe, `0` en caso contrario.
 */
export async function exists(key) {
  return valkey.exists(key);
}

/**
 * Define o actualiza el tiempo de expiración (TTL) de una clave existente.
 * 
 * @param {string} key - Clave a expirar.
 * @param {number} ttlSeconds - Tiempo de expiración en segundos.
 * @returns {Promise<number>} `1` si se estableció con éxito, `0` si la clave no existe.
 */
export async function expire(key, ttlSeconds) {
  return valkey.expire(key, ttlSeconds);
}

// ── Helpers JSON (serialize/deserialize automático) ───────────────────

/**
 * Obtiene y deserializa automáticamente el valor de una clave almacenado en formato JSON.
 * 
 * @param {string} key - Clave a consultar.
 * @returns {Promise<any|null>} El objeto deserializado, o `null` si la clave no existe o no tiene formato JSON válido.
 */
export async function getJson(key) {
  const raw = await valkey.get(key);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Serializa a JSON y guarda un valor asociado a una clave, con tiempo de expiración opcional.
 * 
 * @param {string} key - Clave a registrar.
 * @param {any} value - Objeto o dato a serializar y almacenar.
 * @param {number} [ttlSeconds] - Expiración opcional en segundos.
 * @returns {Promise<'OK'|null>} Confirmación de almacenamiento.
 */
export async function setJson(key, value, ttlSeconds) {
  const json = JSON.stringify(value);
  if (ttlSeconds) return valkey.set(key, json, 'EX', ttlSeconds);
  return valkey.set(key, json);
}

// ── Salud y cierre ───────────────────────────────────────────────────

/**
 * Realiza un ping de diagnóstico al servidor de Valkey.
 * 
 * @returns {Promise<'PONG'>} Respuesta estándar del servidor.
 */
export async function ping() {
  return valkey.ping();
}

/**
 * Cierra la conexión del cliente con Valkey de manera controlada y ordenada.
 * 
 * @returns {Promise<void>}
 */
export async function gracefulShutdown() {
  await valkey.quit();
}

/**
 * Instancia cruda de ioredis (para uso directo en rate-limit store, pub/sub, etc.).
 * Conexión lazy (`.connect()` se llama desde db-pool.js).
 *
 * @type {import('ioredis').Redis}
 */
export { valkey };
