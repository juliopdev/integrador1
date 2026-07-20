import websocket from '@fastify/websocket';
import { initPubSub, onControlEvent } from '../../infrastructure/providers/chat-pubsub.adapter.js';

// Map global para llevar trazabilidad de todas las conexiones WebSocket activas por tenant:
// tenantId -> Set<socket>
const activeTenantConnections = new Map();

/**
 * Registra un socket activo en la memoria del proceso para un tenant específico.
 * Se usa para mantener trazabilidad de todas las conexiones WebSocket activas y poder
 * forzar su cierre cuando el tenant es suspendido o eliminado.
 *
 * @param {string} tenantId - Identificador del tenant.
 * @param {import('ws').WebSocket} socket - Conexión WebSocket activa.
 */
export function registerActiveSocket(tenantId, socket) {
  if (!activeTenantConnections.has(tenantId)) {
    activeTenantConnections.set(tenantId, new Set());
  }
  activeTenantConnections.get(tenantId).add(socket);
}

/**
 * Desregistra un socket activo de la memoria del proceso y limpia el mapa si ya no quedan
 * conexiones para el tenant.
 *
 * @param {string} tenantId - Identificador del tenant.
 * @param {import('ws').WebSocket} socket - Conexión WebSocket a desregistrar.
 */
export function unregisterActiveSocket(tenantId, socket) {
  const set = activeTenantConnections.get(tenantId);
  if (set) {
    set.delete(socket);
    if (set.size === 0) {
      activeTenantConnections.delete(tenantId);
    }
  }
}

/**
 * Cierra de forma forzada todas las conexiones WebSocket activas de un tenant.
 * Se invoca desde el bus de control (pub/sub) cuando el tenant es suspendido o eliminado.
 *
 * @param {string} tenantId - Identificador del tenant.
 * @param {string} [reason='TENANT_SUSPENDED'] - Código de motivo del cierre enviado al cliente (código 4001).
 */
export function forceDisconnectTenant(tenantId, reason = 'TENANT_SUSPENDED') {
  const set = activeTenantConnections.get(tenantId);
  if (set) {
    for (const socket of set) {
      try {
        socket.close(4001, reason);
      } catch {
        // Socket ya cerrado o en proceso de cierre
      }
    }
    activeTenantConnections.delete(tenantId);
  }
}

/**
 * Registra el plugin @fastify/websocket e inicializa el adaptador de Pub/Sub (Valkey) para
 * mensajería en tiempo real, así como el canal de escucha de eventos de control del ciclo de
 * vida del inquilino (suspensión/eliminación → cierre forzado de sockets).
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 */
export async function registerWebSocket(app) {
  await app.register(websocket);

  // Inicializar adaptador de Pub/Sub
  initPubSub(app);

  // Escuchar eventos de control del sistema
  onControlEvent((event) => {
    const { event: eventName, data } = event || {};
    if (!data || !data.tenantId) return;

    if (eventName === 'tenant:set-status') {
      // El evento contiene { tenantId, status }
      if (data.status === 'suspended') {
        forceDisconnectTenant(data.tenantId, 'TENANT_SUSPENDED');
      }
    } else if (eventName === 'tenant:delete') {
      forceDisconnectTenant(data.tenantId, 'TENANT_DELETED');
    }
  });
}
