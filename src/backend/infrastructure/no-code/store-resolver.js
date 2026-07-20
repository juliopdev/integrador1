import { and, eq } from 'drizzle-orm';
import { tenantProviders } from '../../config/drizzle/schema-tenant.js';
import { decrypt } from '../../common/crypto.js';
import { createNeonStore } from '../providers/neon-tech.adapter.js';
import { createMongoStore } from '../providers/mongodb-atlas.adapter.js';
import { AppError } from '../../common/errors.js';

// Resuelve (y cachea por tenant) la conexión al store de datos del tenant. Lee la URI **cifrada**
// (AES-256-GCM) de `tenant_providers` y abre el adapter según el tipo de store. Ver no-code.md.
const cache = new Map(); // `${tenantId}:${storeType}` → store
const PROVIDER = { sql: 'neon', nosql: 'mongodb-atlas' };

/**
 * Resuelve y cachea (por tenant) la conexión al store de datos del tenant.
 * Lee la URI cifrada (AES-256-GCM) de `tenant_providers` y abre el adapter según el tipo de store.
 *
 * @param {{ tenantId: string, tenantDb: object, storeType: 'sql'|'nosql' }} ctx - Contexto de resolución.
 * @param {string} ctx.tenantId - ID del tenant.
 * @param {object} ctx.tenantDb - Conexión Drizzle a la base de datos del tenant.
 * @param {'sql'|'nosql'} ctx.storeType - Tipo de store a resolver.
 * @returns {Promise<object>} Adapter de store (Neon o MongoDB).
 * @throws {AppError} Si el store no está soportado (501) o no está configurado (503).
 */
export async function resolveStore({ tenantId, tenantDb, storeType }) {
  const provider = PROVIDER[storeType];
  if (!provider) {
    throw new AppError(501, 'STORE_NOT_SUPPORTED', `El store '${storeType}' no está soportado.`);
  }
  const key = `${tenantId}:${storeType}`;
  if (cache.has(key)) return cache.get(key);

  const row = tenantDb
    .select()
    .from(tenantProviders)
    .where(and(eq(tenantProviders.category, 'database'), eq(tenantProviders.provider, provider)))
    .limit(1)
    .all()[0];
  if (!row || !row.enabled) {
    throw new AppError(503, 'STORE_NOT_CONFIGURED', `El proveedor de datos '${provider}' del tenant no está configurado.`);
  }

  const { uri } = JSON.parse(decrypt(JSON.parse(row.configValuesJson)));
  const store = storeType === 'sql' ? createNeonStore(uri) : createMongoStore(uri);
  cache.set(key, store);
  return store;
}

/**
 * Cierra todas las conexiones cacheadas a stores de datos (shutdown / limpieza de tests).
 * Itera el caché interno, cierra cada conexión (ignorando errores de conexiones ya cerradas)
 * y limpia el caché.
 *
 * @returns {Promise<void>}
 */
export async function closeAllStores() {
  for (const store of cache.values()) {
    try {
      await store.close();
    } catch {
      /* ya cerrada */
    }
  }
  cache.clear();
}
