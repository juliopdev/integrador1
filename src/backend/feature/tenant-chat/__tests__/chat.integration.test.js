/**
 * Pruebas de integración del WebSocket chat multi-tenant.
 * Cubre: autenticación (sin token → 4401), channel inválido → 4400,
 * handshake + propagación de mensajes en sala, aislamiento de salas,
 * aislamiento de tenants, y desconexión forzada por eventos de control
 * (tenant:set-status, tenant:delete).
 *
 * @module TenantChatIntegrationTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants } from '../../../config/drizzle/schema-platform.js';
import { roles as rolesTable, tenantUsers, userRoles } from '../../../config/drizzle/schema-tenant.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';
import { publishControlEvent } from '../../../kernel/bootstrap/platform-providers.js';

const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let baseUrl;
let tenant1Token;
let tenant2Token;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-chat-ws-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();

  // Crear inquilino 1
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'shop', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');
  const sqlite1 = new Database(join(tmp, 't1.db'));
  const db1 = drizzle(sqlite1);
  db1.insert(rolesTable).values({ id: 'r-master', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db1.insert(tenantUsers).values({
    id: 'u-master1', email: 'master1@shop.com',
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db1.insert(userRoles).values({ userId: 'u-master1', roleId: 'r-master', assignedAt: now }).run();
  sqlite1.close();

  // Crear inquilino 2
  platformDb.insert(tenants).values({ id: 't2', subdomain: 'blog', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t2');
  const sqlite2 = new Database(join(tmp, 't2.db'));
  const db2 = drizzle(sqlite2);
  db2.insert(rolesTable).values({ id: 'r-master', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now }).run();
  db2.insert(tenantUsers).values({
    id: 'u-master2', email: 'master2@blog.com',
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db2.insert(userRoles).values({ userId: 'u-master2', roleId: 'r-master', assignedAt: now }).run();
  sqlite2.close();

  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Logins para obtener tokens
  const login1 = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    headers: { host: 'shop.localhost' },
    payload: { email: 'master1@shop.com', password: PW, passphrase: PP },
  });
  tenant1Token = login1.json().data.accessToken;

  const login2 = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    headers: { host: 'blog.localhost' },
    payload: { email: 'master2@blog.com', password: PW, passphrase: PP },
  });
  tenant2Token = login2.json().data.accessToken;
}, 30000);

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Conecta un WebSocket al chat del tenant.
 * @param {Object} [opts]
 * @param {string} [opts.host='shop.localhost'] - Host header.
 * @param {string|null} [opts.token] - Bearer JWT o null.
 * @param {string|null} [opts.channel='general'] - Sala de chat o null.
 * @returns {WebSocket} Conexión WebSocket.
 */
function connect({ host = 'shop.localhost', token, channel = 'general' } = {}) {
  const query = channel ? `?channel=${channel}` : '';
  const wsUrl = baseUrl.replace(/^http/, 'ws') + `/ws/chat${query}`;
  return new WebSocket(wsUrl, {
    headers: {
      host,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

/**
 * Espera un evento único en un WebSocket.
 * @param {WebSocket} ws - Conexión WebSocket.
 * @param {string} event - Nombre del evento ('open', 'close', 'message', 'error').
 * @returns {Promise<any>} Payload del evento.
 * @example
 * await once(ws, 'open');
 */
function once(ws, event) {
  return new Promise((resolve, reject) => {
    ws.once(event, resolve);
    ws.once('error', reject);
  });
}

describe('WebSocket Tenant Chat — /ws/chat', () => {
  it('sin token → cierra con 4401 UNAUTHENTICATED', async () => {
    const ws = connect({ token: null });
    const [code, reason] = await new Promise((resolve, reject) => {
      ws.once('close', (c, r) => resolve([c, r.toString()]));
      ws.once('error', reject);
    });
    expect(code).toBe(4401);
    expect(reason).toContain('UNAUTHENTICATED');
  });

  it('sin query channel → cierra con 4400 INVALID_CHANNEL', async () => {
    const ws = connect({ token: tenant1Token, channel: null });
    const [code, reason] = await new Promise((resolve, reject) => {
      ws.once('close', (c, r) => resolve([c, r.toString()]));
      ws.once('error', reject);
    });
    expect(code).toBe(4400);
    expect(reason).toContain('INVALID_CHANNEL');
  });

  it('con token válido → handshake exitoso, recibe hello y propaga mensajes en la sala', async () => {
    const ws1 = connect({ token: tenant1Token, channel: 'sala-a' });
    const ws2 = connect({ token: tenant1Token, channel: 'sala-a' });

    const messages1 = [];
    const messages2 = [];
    ws1.on('message', (d) => messages1.push(JSON.parse(d.toString())));
    ws2.on('message', (d) => messages2.push(JSON.parse(d.toString())));

    await Promise.all([once(ws1, 'open'), once(ws2, 'open')]);

    // Verificar saludos iniciales
    expect(messages1[0]).toMatchObject({ type: 'hello', channel: 'sala-a', tenantId: 't1' });
    expect(messages2[0]).toMatchObject({ type: 'hello', channel: 'sala-a', tenantId: 't1' });

    // ws1 envía un mensaje
    ws1.send(JSON.stringify({ text: 'Hola a todos' }));

    // Esperar a recibir la propagación en ambos
    const msg = await new Promise((resolve) => {
      const check = () => {
        const found = messages2.find(m => m.event === 'message');
        if (found) resolve(found);
        else setTimeout(check, 10);
      };
      check();
    });

    expect(msg).toMatchObject({
      event: 'message',
      data: {
        text: 'Hola a todos',
        channel: 'sala-a',
        sender: { email: 'master1@shop.com', scope: 'tenant' },
      }
    });

    ws1.close();
    ws2.close();
    await Promise.all([once(ws1, 'close'), once(ws2, 'close')]);
  });

  it('aislamiento de salas → mensajes de sala-a no sangran a sala-b', async () => {
    const wsA = connect({ token: tenant1Token, channel: 'sala-a' });
    const wsB = connect({ token: tenant1Token, channel: 'sala-b' });

    const messagesB = [];
    wsB.on('message', (d) => messagesB.push(JSON.parse(d.toString())));

    await Promise.all([once(wsA, 'open'), once(wsB, 'open')]);

    // wsA envía un mensaje
    wsA.send(JSON.stringify({ text: 'Secreto de sala A' }));

    // Esperar brevemente
    await new Promise(r => setTimeout(r, 100));

    // wsB no debería haber recibido ningún evento message
    const msgReceived = messagesB.some(m => m.event === 'message');
    expect(msgReceived).toBe(false);

    wsA.close();
    wsB.close();
    await Promise.all([once(wsA, 'close'), once(wsB, 'close')]);
  });

  it('aislamiento de tenants → mensajes de tenant 1 no sangran a tenant 2', async () => {
    const ws1 = connect({ token: tenant1Token, channel: 'lobby' });
    const ws2 = connect({ host: 'blog.localhost', token: tenant2Token, channel: 'lobby' });

    const messages2 = [];
    ws2.on('message', (d) => messages2.push(JSON.parse(d.toString())));

    await Promise.all([once(ws1, 'open'), once(ws2, 'open')]);

    // Tenant 1 envía mensaje en su lobby
    ws1.send(JSON.stringify({ text: 'Mensaje de t1' }));

    // Esperar
    await new Promise(r => setTimeout(r, 100));

    // Tenant 2 no recibe nada del t1
    const msgReceived = messages2.some(m => m.event === 'message');
    expect(msgReceived).toBe(false);

    ws1.close();
    ws2.close();
    await Promise.all([once(ws1, 'close'), once(ws2, 'close')]);
  });

  it('desconexión forzada → evento de control tenant:set-status(suspended) desconecta sockets', async () => {
    const ws = connect({ token: tenant1Token, channel: 'lobby' });
    await once(ws, 'open');

    // Simular que el control cambia a t1 a suspended
    await publishControlEvent({
      event: 'tenant:set-status',
      data: { tenantId: 't1', status: 'suspended' }
    });

    const [code, reason] = await new Promise((resolve) => {
      ws.once('close', (c, r) => resolve([c, r.toString()]));
    });

    expect(code).toBe(4001);
    expect(reason).toBe('TENANT_SUSPENDED');
  });

  it('desconexión forzada → evento de control tenant:delete desconecta sockets', async () => {
    const ws = connect({ token: tenant2Token, channel: 'lobby', host: 'blog.localhost' });
    await once(ws, 'open');

    // Simular que el control elimina t2
    await publishControlEvent({
      event: 'tenant:delete',
      data: { tenantId: 't2' }
    });

    const [code, reason] = await new Promise((resolve) => {
      ws.once('close', (c, r) => resolve([c, r.toString()]));
    });

    expect(code).toBe(4001);
    expect(reason).toBe('TENANT_DELETED');
  });
});
