import { errorBody } from '../../../../common/responses.js';

/**
 * Rutas API del feature `manage-platform-log`.
 *
 * `GET /api-system/v1/logs/stream` — Server-Sent Events con cada log persistido por el
 * `platform-log-recorder.hook`. Superadmin-only.
 *
 * Contrato SSE:
 *   - Content-Type: `text/event-stream`
 *   - Cada evento tiene formato `data: <json>\n\n` (línea única de payload, doble newline separa
 *     eventos). El cliente `<Terminal>` lo consume vía `EventSource`.
 *   - Un `event: connected` inicial confirma la suscripción (el widget lo usa como signal de "●
 *     live" en el footer del terminal).
 *   - Heartbeat: cada 25 s se envía un comentario SSE (`: ping\n\n`) para evitar que proxies
 *     intermedios (nginx/CDN) cierren la conexión por idle. Comentarios NO llegan al onmessage
 *     del cliente — son transparentes.
 *
 * Cleanup: al `close` del socket se desuscribe del bus y se detiene el heartbeat. Sin esto,
 * cada reconexión del cliente acumulaba listeners hasta el `setMaxListeners`.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @param {Object} deps - Dependencias inyectadas.
 * @param {import('node:events').EventEmitter} deps.logEventBus - Bus interno de eventos de log para SSE.
 */
export function registerPlatformLogApi(app, { logEventBus }) {
  app.get('/api-system/v1/logs/stream', (request, reply) => {
    if (!request.user || request.user.scope !== 'platform') {
      return reply.code(403).send(errorBody(403, 'FORBIDDEN', 'Sólo el Superadmin puede escuchar el stream de logs.'));
    }

    // Cabeceras SSE: Fastify no maneja SSE nativamente, se escribe raw. `X-Accel-Buffering: no`
    // desactiva el buffer de nginx en el intermedio (si existe) — sin esto los eventos llegan
    // en ráfagas de bloque en vez de en tiempo real.
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (line) => {
      // Reply cerrado (cliente se fue): silenciar. `writable` es la señal correcta para socket
      // Node; `destroyed` puede quedar true justo antes.
      if (!reply.raw.writable) return;
      reply.raw.write(line);
    };

    // Handshake explícito: el widget escucha `event: connected` para pintar "● live".
    write('event: connected\ndata: {"ok":true}\n\n');

    const onLog = (row) => {
      // El widget aplica formato ANSI en cliente; server envía el mensaje limpio + metadata.
      const payload = {
        id: row.id,
        level: row.level,
        message: row.message,
        createdAt: row.createdAt,
      };
      write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    logEventBus.on('log', onLog);

    // Heartbeat: comentarios SSE (línea que empieza con `:`) mantienen viva la conexión sin
    // disparar `onmessage` en el cliente. 25 s es un margen cómodo bajo los 30-60 s típicos de
    // proxies.
    const heartbeat = setInterval(() => write(': ping\n\n'), 25_000);

    // Cleanup completo al cerrar. `request.raw.on('close')` cubre tanto el cliente cerrando el
    // tab como el server cerrando el socket.
    const cleanup = () => {
      clearInterval(heartbeat);
      logEventBus.off('log', onLog);
      try { reply.raw.end(); } catch { /* ya cerrado */ }
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  });
}
