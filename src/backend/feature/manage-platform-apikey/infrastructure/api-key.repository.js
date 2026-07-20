import { and, eq } from 'drizzle-orm';
import { apiKeys } from '../../../config/drizzle/schema-tenant.js';

/**
 * Fábrica del repositorio de API keys del tenant (tabla `api_keys` de SU tenant.db — Fase 2).
 * PLAN-ux2 P4: una key "frontend" activa por tenant, emitida por el Superadmin desde el listado
 * de backends. Se persiste SOLO el hash SHA-256 (security.md); el valor crudo se muestra una única vez.
 *
 * @param {Object} deps - Dependencias del repositorio.
 * @param {import('drizzle-orm').DrizzleD1Database} deps.db - Conexión Drizzle al tenant.db (LRU pool).
 * @returns {ApiKeyRepository} Objeto con métodos de acceso a API keys.
 * @example
 * const apiKeyRepo = createApiKeyRepository({ db: tenantDb });
 * const key = apiKeyRepo.findActiveByName('frontend');
 */
export function createApiKeyRepository({ db }) {
  return {
    /**
     * Busca una API key activa por su nombre.
     * @param {string} name - Nombre de la key (ej: 'frontend').
     * @returns {Object|null} Fila de la key o `null` si no existe.
     */
    findActiveByName(name) {
      const rows = db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.name, name), eq(apiKeys.status, 'active')))
        .limit(1)
        .all();
      return rows[0] ?? null;
    },

    /**
     * Inserta una nueva API key activa (solo se persiste el hash SHA-256).
     * @param {Object} params - Datos de la key.
     * @param {string} params.id - ID único de la key.
     * @param {string} params.name - Nombre de la key.
     * @param {string} params.tokenHash - Hash SHA-256 del valor crudo de la key.
     * @param {string|null} [params.scopesJson=null] - JSON con los alcances de la key.
     * @param {number} params.now - Timestamp de creación en ms.
     */
    insertKey({ id, name, tokenHash, scopesJson = null, now }) {
      db.insert(apiKeys)
        .values({ id, name, tokenHash, scopesJson, status: 'active', createdAt: now, updatedAt: now })
        .run();
    },

    /**
     * Busca una API key activa por su hash SHA-256 (validación del Bearer `mbk_` en el dispatcher).
     * @param {string} tokenHash - Hash SHA-256 de la key.
     * @returns {Object|null} Fila de la key o `null`.
     */
    findActiveByHash(tokenHash) {
      const rows = db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.tokenHash, tokenHash), eq(apiKeys.status, 'active')))
        .limit(1)
        .all();
      return rows[0] ?? null;
    },

    /**
     * Actualiza el timestamp del último uso de la key (best-effort).
     * @param {Object} params - Parámetros de actualización.
     * @param {string} params.id - ID de la key.
     * @param {number} params.now - Timestamp del último uso en ms.
     */
    touchLastUsed({ id, now }) {
      db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, id)).run();
    },

    /**
     * Revoca una API key (cambia su estado a 'revoked').
     * @param {Object} params - Parámetros de revocación.
     * @param {string} params.id - ID de la key a revocar.
     * @param {number} params.now - Timestamp de revocación en ms.
     */
    revokeKey({ id, now }) {
      db.update(apiKeys).set({ status: 'revoked', updatedAt: now }).where(eq(apiKeys.id, id)).run();
    },
  };
}
