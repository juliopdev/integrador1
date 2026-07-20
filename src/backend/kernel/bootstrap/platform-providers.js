import { valkey, del as cacheDel } from '../../infrastructure/providers/cache-core.adapter.js';
import { tenantCacheKey } from '../hooks/tenant-loader.hook.js';
import { logger } from '../../infrastructure/providers/logger.js';
import { testProviderConnection } from '../../infrastructure/providers/registry.js';

/**
 * Proveedores de PLATAFORMA del composition root (kernel/bootstrap/): adaptadores e integraciones
 * que el orquestador apex (`bootstrap-platform.js`) inyecta en los use cases. Se extraen aquí para
 * que el orquestador quede como wiring puro (qué se conecta con qué) y este módulo concentre el
 * CÓMO se habla con cada servicio externo.
 *
 * Ver .doc/rules/architecture.md §2 (composition root) y .doc/tree/src/backend/kernel.md.
 */

// Retries de invalidación de caché: cubren fallos transitorios de red a Valkey sin bloquear la
// mutación del tenant. Si tras N intentos sigue fallando, el TTL (60s del hook) es la última red.
const CACHE_INVALIDATION_ATTEMPTS = 3;
const CACHE_INVALIDATION_BACKOFF_MS = [50, 200, 800];

/**
 * Invalidación de la caché del `tenant-loader` (misma clave que produce el hook). La usan los
 * use cases que mutan el estado del tenant (set-status/delete) para que el cambio pegue al instante.
 * Reintenta con backoff exponencial ante fallos transitorios de Valkey; si agota los intentos,
 * loguea y **relanza** — el caller decide si tolera el fallo (política best-effort en los use cases,
 * pero informada: hay un log ERROR por cada fallo definitivo).
 */
export async function invalidateSubdomainCache(subdomain) {
  if (!subdomain) return;
  const key = tenantCacheKey(subdomain);
  let lastErr;
  for (let i = 0; i < CACHE_INVALIDATION_ATTEMPTS; i++) {
    try {
      await cacheDel(key);
      if (i > 0) logger.info({ key, attempt: i + 1 }, '[cache] invalidación exitosa tras reintento');
      return;
    } catch (err) {
      lastErr = err;
      logger.warn({ err, key, attempt: i + 1 }, '[cache] fallo invalidando; reintentando');
      if (i < CACHE_INVALIDATION_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, CACHE_INVALIDATION_BACKOFF_MS[i]));
      }
    }
  }
  logger.error({ err: lastErr, key, attempts: CACHE_INVALIDATION_ATTEMPTS }, '[cache] agotados los reintentos de invalidación (caerá por TTL)');
  throw lastErr;
}

/**
 * Publica un evento de control por Valkey pub/sub (p.ej. cierre forzado de sockets al suspender).
 *
 * @param {Object} event - Objeto del evento de control a publicar (se serializa como JSON).
 * @returns {Promise<void>}
 */
export async function publishControlEvent(event) {
  await valkey.publish('ws:control', JSON.stringify(event));
}

/**
 * Verificación mínima de conexión por `category/provider` ANTES de cifrar y persistir la config
 * en `tenant_providers`. P8.5: delega al registry — cada provider define su `testConnection` en
 * `infrastructure/providers/registry.js`. Agregar un provider nuevo ya no requiere tocar acá.
 *
 * @param {{ category: string, provider: string, config: object }} args
 * @returns {Promise<boolean>}
 */
export async function testConnection({ category, provider, config }) {
  return testProviderConnection({ category, provider, config });
}

