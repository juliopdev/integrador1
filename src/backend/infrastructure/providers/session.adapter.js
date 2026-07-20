import { randomBytes } from 'node:crypto';
import { getJson, setJson, del, valkey } from './cache-core.adapter.js';

// Almacén de sesiones en Valkey (security.md). La cookie HttpOnly lleva el `sessionId`;
// la sesión es revocable (logout / cambio de contraseña / suspensión de tenant) y caduca por TTL.
// El access token JWT (15 min, stateless) se emite aparte; el refresh sólo renueva si la sesión vive.
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días = vida del refresh

const sessKey = (sessionId) => `sess:${sessionId}`;
// Índice por ámbito para revocación masiva (p.ej. suspender un tenant borra todas sus sesiones).
const indexKey = (data) => (data.tenantId ? `tenant:${data.tenantId}:sessions` : 'scope:platform:sessions');

/**
 * Crea y almacena una nueva sesión de usuario en Valkey, registrando su ID en un Set indexado
 * para posibilitar la revocación masiva por tenant o por plataforma.
 * 
 * @param {Object} data - Datos de sesión del usuario.
 * @param {string} data.userId - ID único de usuario.
 * @param {string} data.email - Correo del usuario.
 * @param {'platform'|'tenant'|'user'} data.scope - Ámbito de la sesión.
 * @param {string} [data.tenantId] - ID del tenant si corresponde.
 * @returns {Promise<string>} ID único de sesión autogenerado (guardado en cookie).
 */
export async function createSession(data) {
  const sessionId = randomBytes(32).toString('hex');
  await setJson(sessKey(sessionId), data, TTL_SECONDS);
  await valkey.sadd(indexKey(data), sessionId);
  return sessionId;
}

/**
 * Obtiene los datos de la sesión asociados al ID de sesión de la cookie.
 * 
 * @param {string} sessionId - ID único de la sesión.
 * @returns {Promise<Object|null>} Datos del usuario e información de alcance, o null si expiró o no existe.
 */
export async function getSession(sessionId) {
  if (!sessionId) return null;
  return getJson(sessKey(sessionId));
}

/**
 * Elimina una sesión activa por su ID de sesión, removiéndola también del Set indexado en Valkey.
 * 
 * @param {string} sessionId - ID único de sesión a revocar.
 * @returns {Promise<void>}
 */
export async function destroySession(sessionId) {
  if (!sessionId) return;
  const data = await getJson(sessKey(sessionId));
  await del(sessKey(sessionId));
  if (data) await valkey.srem(indexKey(data), sessionId);
}

/**
 * Revoca de forma masiva todas las sesiones de un usuario específico dentro de un tenant o de la plataforma global.
 * 
 * @param {Object} params
 * @param {string|null|undefined} params.tenantId - ID único del tenant, o null si pertenece a plataforma global.
 * @param {string} params.userId - ID único del usuario cuyas sesiones se destruirán.
 * @returns {Promise<void>}
 */
export async function destroyUserSessions({ tenantId, userId }) {
  const idxKey = tenantId ? `tenant:${tenantId}:sessions` : 'scope:platform:sessions';
  const ids = await valkey.smembers(idxKey);
  for (const sessionId of ids) {
    const data = await getJson(sessKey(sessionId));
    if (data?.userId === userId) {
      await del(sessKey(sessionId));
      await valkey.srem(idxKey, sessionId);
    }
  }
}
