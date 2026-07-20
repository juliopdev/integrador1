import { EventEmitter } from 'node:events';

/**
 * Recorder singleton de logs de plataforma.
 *
 * Doble propósito:
 *  1. **Persistir** en `platform_logs_local` (para el listado paginado + audit histórico).
 *  2. **Emitir en un bus interno** (`logEventBus`) para que el endpoint SSE
 *     `/api-system/v1/logs/stream` empuje cada log a los clientes conectados en tiempo real.
 *
 * El wiring vive en `bootstrap-platform.js`: al inicializar el logRepository se llama a
 * `configureLogRecorder({ logRepository })` una sola vez. A partir de ahí cualquier código puede
 * hacer `record(...)` sin dependencias explícitas (patrón "observability sink", cross-cutting).
 * Es un singleton porque el bus interno DEBE ser único entre productores (hooks, jobs) y
 * consumidores (SSE handler) — un EE por request no permite el broadcast.
 *
 * NO reemplaza a pino: pino sigue imprimiendo a stdout con pino-pretty. Este recorder es el
 * pipeline de logs "consumibles por el operador" (los que aparecen en `/dashboard/logs`).
 */

/** Bus interno para el stream SSE. `log` es el único evento; el payload es la fila insertada. */
export const logEventBus = new EventEmitter();
// Sin `setMaxListeners` se cae en un warning a partir del listener 11 — cada cliente SSE es un
// listener, y en un dashboard con varias pestañas abiertas es fácil pasarse.
logEventBus.setMaxListeners(50);

let boundRepository = null;

/**
 * Inyecta el logRepository. Idempotente en el sentido de que sobrescribe — llamar dos veces con
 * repos distintos no es válido en producción, pero facilita tests que reconfiguran el sink.
 * @param {Object} params - Parámetros de configuración.
 * @param {Object} params.logRepository - Repositorio de logs a inyectar.
 */
export function configureLogRecorder({ logRepository }) {
  boundRepository = logRepository;
}

/**
 * Registra un log: persiste + emite. Sin repository configurado es no-op silencioso (nunca debe
 * romper el flujo del caller — un log es best-effort, no un side-effect crítico).
 *
 * `level` acotado por check constraint SQL (`info | warn | error`); mensajes fuera se rechazan
 * silenciosamente para no romper el request.
 *
 * @param {Object} entry - Entrada de log a registrar.
 * @param {'info'|'warn'|'error'} entry.level - Nivel de severidad.
 * @param {string} entry.message - Mensaje descriptivo.
 * @param {object} [entry.metadata=null] - Metadatos opcionales asociados al log.
 * @returns {object|null} Fila insertada (con id, level, message, createdAt) o `null` si no pudo
 *   registrarse (repository no configurado, nivel inválido, mensaje vacío, o error del sink).
 * @example
 * record({ level: 'info', message: 'Tenant creado', metadata: { tenantId: 'abc' } })
 */
export function record({ level, message, metadata = null }) {
  if (!boundRepository) return null;
  if (level !== 'info' && level !== 'warn' && level !== 'error') return null;
  if (!message) return null;

  try {
    const row = boundRepository.insert({ level, message, metadata });
    // Emitido "post-persist" para que el consumidor SSE tenga la fila estable (con id + createdAt).
    logEventBus.emit('log', row);
    return row;
  } catch {
    // Fallo del sink NO propaga: un log perdido es aceptable, un request roto por logging no.
    return null;
  }
}

/**
 * Helper para tests: resetea el estado interno del recorder y elimina todos los listeners
 * del bus. NO usar en runtime de producción.
 */
export function _resetForTests() {
  boundRepository = null;
  logEventBus.removeAllListeners();
}
