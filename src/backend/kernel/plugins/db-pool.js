import { valkey, ping as valkeyPing, gracefulShutdown } from '../../infrastructure/providers/cache-core.adapter.js';
import { tenantPool } from '../../config/database/connection-pool/lru-manager.js';
import { env } from '../../config/env.js';

/**
 * Registra y verifica los pools de bases de datos centrales: conexión a Valkey (dependencia dura)
 * y el pool LRU para bases de datos SQLite de tenants. Verifica que Valkey responda al ping durante
 * el arranque y decora la instancia de Fastify con `app.valkey` y `app.tenantPool` para acceso global.
 * Registra un hook `onClose` que cierra ambos pools de forma ordenada al apagar.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 * @throws {Error} Si Valkey no responde al ping — el arranque de la aplicación se aborta.
 */
export async function registerDbPool(app) {
  // Conectar y verificar Valkey (dependencia dura — falla el arranque si no responde).
  if (valkey.status !== 'ready' && valkey.status !== 'connecting') {
    await valkey.connect();
  }
  await valkeyPing();
  app.log.info('[db-pool] Valkey conectado y respondiendo.');

  app.decorate('valkey', valkey);
  app.decorate('tenantPool', tenantPool);

  app.addHook('onClose', async () => {
    tenantPool.closeAll();
    if (env.NODE_ENV !== 'test') {
      await gracefulShutdown();
    } else {
      try { await valkey.flushall(); } catch { /* ignore */ }
    }
    app.log.info('[db-pool] Pools cerrados.');
  });
}