import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import { env } from '../config/env.js';
import { platformSqlite } from '../config/database/platform/sqlite-platform.js';
import { ping as valkeyPing } from '../infrastructure/providers/cache-core.adapter.js';

// ── Manejador de errores ──────────────────────────────────────────────
import { registerErrorHandler } from './error-handler.js';

// ── Plugins (orden por dependencias) ──────────────────────────────────
import { registerDbPool } from './plugins/db-pool.js';
import { registerCors } from './plugins/cors.js';
import { registerViews } from './plugins/views.js';
import { registerStatic } from './plugins/static.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerWebSocket } from './plugins/websocket.js';
import { registerPassport } from './plugins/passport.js';
import { registerMetrics } from './plugins/metrics.js';

// ── Hooks globales ────────────────────────────────────────────────────
import { registerSecurityHeaders } from './hooks/security-headers.hook.js';
import { registerDevLogger } from './hooks/dev-logger.hook.js';
import { registerPlatformLogRecorder } from './hooks/platform-log-recorder.hook.js';
import { registerRateLimiter } from './hooks/rate-limiter.hook.js';
import { registerTenantLoader } from './hooks/tenant-loader.hook.js';
import { registerCorsValidator } from './hooks/cors-validator.hook.js';

// ── Bootstrap (rutas de plataforma y tenant) ──────────────────────────
import { bootstrapPlatform } from './bootstrap-platform.js';
import { bootstrapTenant } from './bootstrap-tenant.js';
import { registerPassportStrategies } from './bootstrap/register-passport.js';

/**
 * Inicializa, configura y construye la instancia de la aplicación Fastify.
 * Registra de forma secuencial y ordenada por dependencias los manejadores de errores,
 * plugins de infraestructura (Valkey/base de datos), plugins de protocolo (CORS, Views, WebSocket),
 * estrategias de autenticación centralizadas, hooks del ciclo de vida global y rutas principales.
 * 
 * @returns {Promise<import('fastify').FastifyInstance>} Instancia configurada de Fastify lista para inicializarse.
 * @throws {Error} Si el ping a Valkey falla durante el registro de `db-pool`.
 */
export async function buildApp() {
  const app = Fastify({
    trustProxy: true,
    logger:
      env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : env.NODE_ENV === 'test'
          ? false
          : true,
  });

  // ── 1. Manejador global de errores ──────────────────────────────────
  // setErrorHandler, no un hook de ciclo de vida. Ver error-handler.js y errors.md.
  registerErrorHandler(app);

  // ── 2. Plugin de infraestructura (dependencia dura) ─────────────────
  // Valkey debe estar arriba para que sesiones, rate-limit y caché funcionen.
  // Si el ping falla, el arranque aborta (ver bootstrap.md).
  await registerDbPool(app);

  // ── 3. Plugins de protocolo ─────────────────────────────────────────
  await app.register(cookie);     // Cookies (requerido por passport y auth)
  await app.register(formbody);   // Parseo de application/x-www-form-urlencoded
  // multipart/form-data para uploads de assets y frontend archives. Límite de 52 MB por archivo:
  // asset-upload (tenant-data) usa 10 MB estricto en el usecase, hosted-deploy (manage-platform-
  // frontend) permite hasta 50 MB. El margen extra evita errores de borde.
  await app.register(multipart, { limits: { fileSize: 52 * 1024 * 1024, files: 1 } });
  await registerCors(app);
  await registerViews(app);
  await registerStatic(app); // sirve public/ (assets de Vite)
  await registerSwagger(app);
  await registerWebSocket(app);

  // ── 4. Auth ─────────────────────────────────────────────────────────
  // Plugin = infraestructura (@fastify/passport + secure-session); las ESTRATEGIAS se centralizan
  // en bootstrap/register-passport.js (composition root). No hay contenedor DI: el wiring de
  // dependencias es explícito en bootstrap-platform/tenant (ver architecture.md §2).
  await registerPassport(app);
  registerPassportStrategies(app);

  // ── 5. Observabilidad ───────────────────────────────────────────────
  await registerMetrics(app);

  // ── 6. Hooks globales (orden: onRequest → preHandler) ───────────────
  registerSecurityHeaders(app);   // onRequest: cabeceras de seguridad
  registerDevLogger(app);         // onRequest + onResponse: logs de dev (solo development)
  registerPlatformLogRecorder(app); // onResponse: persiste + emite log al bus (SSE en /dashboard/logs)
  await registerRateLimiter(app); // preHandler: limitador de tasa (Valkey store)
  registerTenantLoader(app);      // onRequest GLOBAL: resuelve tenant por subdominio → request.tenant/db
  registerCorsValidator(app);     // onRequest GLOBAL: valida origen de CORS

  // ── 7. Health endpoint ──────────────────────────────────────────────
  // Reporta estado de las dependencias duras. Ver bootstrap.md.
  app.get('/health', async () => {
    let dbOk = false;
    let valkeyOk = false;
    try { platformSqlite.prepare('SELECT 1').get(); dbOk = true; } catch { /* */ }
    try { await valkeyPing(); valkeyOk = true; } catch { /* */ }
    return {
      status: dbOk && valkeyOk ? 'ok' : 'degraded',
      env: env.NODE_ENV,
      uptime: Number(process.uptime().toFixed(1)),
      dependencies: { platformDb: dbOk, valkey: valkeyOk },
    };
  });

  // ── 8. Bootstrap de rutas ───────────────────────────────────────────
  // Los hooks selectivos (tenant-loader, session-auth, rbac, cors-validator)
  // se registran dentro de los bootstrap, no globalmente.
  await bootstrapPlatform(app);
  await bootstrapTenant(app);

  return app;
}
