/**
 * Pruebas de seguridad sobre la app completa (fastify.inject).
 * Cubre tres superficies obligatorias del SaaS multi-tenant:
 *   1. Aislamiento de inquilinos — tokens/cookies de Tenant A no alcanzan a B.
 *   2. RBAC — rutas de plataforma rechazan scopes tenant/user; rutas de Master rechazan Staff.
 *   3. Integridad de tokens JWT — firmas adulteradas, expiración, alg: none, secreto incorrecto.
 *   4. Matriz sistemática endpoints × tokens (4×4).
 *
 * @module TenantIsolationRBACSecurityTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import jwt from 'jsonwebtoken';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../src/backend/config/env.js';
import { migratePlatform, migrateTenant } from '../../src/backend/config/drizzle/migrator.js';
import { platformDb } from '../../src/backend/config/database/platform/sqlite-platform.js';
import { tenants, platformUsers } from '../../src/backend/config/drizzle/schema-platform.js';
import { roles, tenantUsers, userRoles } from '../../src/backend/config/drizzle/schema-tenant.js';
import { hashSecret } from '../../src/backend/common/password.js';
import { signAccessToken } from '../../src/backend/common/jwt.js';
import { buildApp } from '../../src/backend/kernel/app.js';

/**
 * Pruebas de SEGURIDAD (tests.md §2C) sobre la app completa (`fastify.inject`). Cubren las tres
 * superficies obligatorias del SaaS multi-tenant:
 *   1. Aislamiento de inquilinos — un token/cookie del Tenant A jamás alcanza al Tenant B.
 *   2. RBAC — rutas de plataforma rechazan scopes de tenant/user; rutas de Master rechazan Staff.
 *   3. Tokens — firmas adulteradas, expiración, secreto incorrecto y `alg: none` son rechazados.
 *
 * Dos tenants reales (`tienda`/`otra`), cada uno con su `<id>.db`, su Master y su Staff.
 */

const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let t1MasterToken; // scope=tenant, tenantId=t1
let t1StaffToken;  // scope=tenant, tenantId=t1 (categoría staff)
let t1MasterCookie;
let superToken;    // scope=platform

/**
 * Crea un usuario de tenant con credenciales, roles y estado activo.
 * @param {import('drizzle-orm/better-sqlite3').BetterSQLite3Database} db - Drizzle DB del tenant.
 * @param {Object} params
 * @param {string} params.id - ID único del usuario.
 * @param {string} params.email - Correo electrónico.
 * @param {string} params.roleId - ID del rol asignado.
 * @param {number} params.now - Timestamp de creación.
 */
async function seedUser(db, { id, email, roleId, now }) {
  db.insert(tenantUsers).values({
    id, email, passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    status: 'active', createdAt: now, updatedAt: now,
  }).run();
  db.insert(userRoles).values({ userId: id, roleId, assignedAt: now }).run();
}

/**
 * Crea un tenant completo con platform.db + migración + roles + usuarios.
 * @param {string} id - ID del tenant.
 * @param {string} subdomain - Subdominio público.
 * @param {number} now - Timestamp de creación.
 */
async function seedTenant(id, subdomain, now) {
  platformDb.insert(tenants).values({ id, subdomain, status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant(id);
  const sqlite = new Database(join(tmp, `${id}.db`));
  const db = drizzle(sqlite);
  db.insert(roles).values([
    { id: `${id}-master`, name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now },
    { id: `${id}-inventory`, name: 'inventory', category: 'staff', isReserved: 0, createdAt: now, updatedAt: now },
  ]).run();
  await seedUser(db, { id: `${id}-u-master`, email: `master@${subdomain}.com`, roleId: `${id}-master`, now });
  await seedUser(db, { id: `${id}-u-staff`, email: `staff@${subdomain}.com`, roleId: `${id}-inventory`, now });
  sqlite.close();
}

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-sec-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  // Superadmin (apex) — activo cuando tiene passwordHash.
  platformDb.insert(platformUsers).values({
    id: 'sa', email: 'super@baas.com',
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    createdAt: now, updatedAt: now,
  }).run();

  await seedTenant('t1', 'tienda', now);
  await seedTenant('t2', 'otra', now);

  app = await buildApp();

  const login = (host, email) => app.inject({
    method: 'POST', url: '/api-system/v1/login',
    headers: host ? { host } : {},
    payload: { email, password: PW, passphrase: PP },
  });

  const superLogin = await login(null, 'super@baas.com');
  superToken = superLogin.json().data.accessToken;

  const t1MasterLogin = await login('tienda.localhost', 'master@tienda.com');
  t1MasterToken = t1MasterLogin.json().data.accessToken;
  t1MasterCookie = t1MasterLogin.cookies.find((c) => c.name === 'tenant_sid').value;

  t1StaffToken = (await login('tienda.localhost', 'staff@tienda.com')).json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Helper que dispara GET /api-system/v1/staff (ruta de Master en subdominio).
 * @param {string|null} host - Host header (subdominio o null).
 * @param {Object} [opts]
 * @param {string} [opts.token] - Bearer JWT.
 * @param {string} [opts.cookie] - Valor de cookie tenant_sid.
 * @returns {Promise<import('fastify').LightMyRequestResponse>} Respuesta de Fastify inject.
 * @example
 * const res = await staffList('tienda.localhost', { token: masterToken });
 */
const staffList = (host, { token, cookie } = {}) => app.inject({
  method: 'GET', url: '/api-system/v1/staff',
  headers: {
    ...(host ? { host } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { cookie: `tenant_sid=${cookie}` } : {}),
  },
});

describe('Seguridad §1 — Aislamiento de inquilinos (multi-tenant)', () => {
  it('token del Master de t1 usado en el subdominio de t2 → 401 (session-auth descarta por tenantId)', async () => {
    const res = await staffList('otra.localhost', { token: t1MasterToken });
    expect(res.statusCode).toBe(401);
  });

  it('cookie de sesión del Master de t1 reenviada al subdominio de t2 → 401 (defensa en profundidad)', async () => {
    // Las cookies son host-only (sin Domain); aun forzándola, la sesión trae tenantId=t1 ≠ t2.
    const res = await staffList('otra.localhost', { cookie: t1MasterCookie });
    expect(res.statusCode).toBe(401);
  });

  it('token válido de t1 SÍ opera en su propio subdominio (control positivo) → 200', async () => {
    const res = await staffList('tienda.localhost', { token: t1MasterToken });
    expect(res.statusCode).toBe(200);
  });

  it('token forjado con tenantId=t2 presentado en el subdominio de t1 → 401 (tenantId ≠ host)', async () => {
    const forged = signAccessToken({ sub: 't2-u-master', email: 'master@otra.com', scope: 'tenant', tenantId: 't2' });
    const res = await staffList('tienda.localhost', { token: forged });
    expect(res.statusCode).toBe(401);
  });

  it('token con tenantId correcto pero usuario inexistente → 403 (RBAC no halla roles)', async () => {
    // session-auth acepta (scope+tenantId válidos), pero el guard consulta roles por user.id y no
    // encuentra ninguno → deniega. Aísla identidad, no solo tenant.
    const forged = signAccessToken({ sub: 'ghost-user', email: 'ghost@tienda.com', scope: 'tenant', tenantId: 't1' });
    const res = await staffList('tienda.localhost', { token: forged });
    expect(res.statusCode).toBe(403);
  });
});

describe('Seguridad §2 — RBAC (matriz de accesos)', () => {
  it('Staff de t1 NO puede listar Staff (ruta exclusiva de Master) → 403', async () => {
    const res = await staffList('tienda.localhost', { token: t1StaffToken });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('sin credencial → 401', async () => {
    const res = await staffList('tienda.localhost');
    expect(res.statusCode).toBe(401);
  });

  it('token de Master (scope=tenant) NO puede crear tenants en apex (ruta de plataforma) → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api-system/v1/tenants',
      headers: { authorization: `Bearer ${t1MasterToken}` },
      payload: { subdomain: 'nuevo', masterEmail: 'x@nuevo.com' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('token de Superadmin (scope=platform) NO se acepta en un subdominio de tenant → 401', async () => {
    // En subdominio, session-auth solo acepta scope tenant/user; platform queda fuera de contexto.
    const res = await staffList('tienda.localhost', { token: superToken });
    expect(res.statusCode).toBe(401);
  });

  it('Superadmin SÍ crea tenants en apex (control positivo) → 201', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api-system/v1/tenants',
      headers: { authorization: `Bearer ${superToken}` },
      payload: { subdomain: 'nuevo-ok', masterEmail: 'x@nuevo-ok.com' },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('Seguridad §3 — Integridad de tokens JWT', () => {
  it('firma adulterada (último carácter alterado) → 401', async () => {
    const tampered = t1MasterToken.slice(0, -1) + (t1MasterToken.endsWith('a') ? 'b' : 'a');
    const res = await staffList('tienda.localhost', { token: tampered });
    expect(res.statusCode).toBe(401);
  });

  it('token expirado (firmado con el secreto real pero ya vencido) → 401', async () => {
    const expired = jwt.sign(
      { sub: 't1-u-master', email: 'master@tienda.com', scope: 'tenant', tenantId: 't1' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-10s' },
    );
    const res = await staffList('tienda.localhost', { token: expired });
    expect(res.statusCode).toBe(401);
  });

  it('token firmado con un secreto distinto → 401', async () => {
    const wrong = jwt.sign(
      { sub: 't1-u-master', email: 'master@tienda.com', scope: 'tenant', tenantId: 't1' },
      'otro-secreto-completamente-distinto-de-32+chars',
      { algorithm: 'HS256' },
    );
    const res = await staffList('tienda.localhost', { token: wrong });
    expect(res.statusCode).toBe(401);
  });

  it('token con `alg: none` (sin firma) → 401 (verifier fija algorithms=[HS256])', async () => {
    // `algorithm: 'none'` exige secreto nulo en jsonwebtoken; el token queda sin firma.
    const unsigned = jwt.sign(
      { sub: 't1-u-master', email: 'master@tienda.com', scope: 'tenant', tenantId: 't1' },
      null,
      { algorithm: 'none' },
    );
    const res = await staffList('tienda.localhost', { token: unsigned });
    expect(res.statusCode).toBe(401);
  });

  it('Bearer malformado (no-JWT) → 401', async () => {
    const res = await staffList('tienda.localhost', { token: 'esto-no-es-un-jwt' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Seguridad §4 — Matriz Sistemática de RBAC (endpoints vs tokens)', () => {
  const matrix = [
    // 1. Rutas de Plataforma (Apex)
    {
      name: 'Crear tenant (Plataforma)',
      method: 'POST',
      url: '/api-system/v1/tenants',
      headers: {},
      payload: { subdomain: 'matrix-sub', masterEmail: 'matrix@sub.com' },
      expected: { anon: 403, super: 201, master: 403, staff: 403 }
    },
    {
      name: 'Listar backends de t1 (Plataforma)',
      method: 'GET',
      url: '/api-system/v1/tenants/t1/backends',
      headers: {},
      expected: { anon: 403, super: 200, master: 403, staff: 403 }
    },
    // 2. Rutas de Tenant (Subdominio)
    {
      name: 'Listar staff de tienda (Tenant)',
      method: 'GET',
      url: '/api-system/v1/staff',
      headers: { host: 'tienda.localhost' },
      expected: { anon: 401, super: 401, master: 200, staff: 403 }
    },
    {
      name: 'Invitar staff en tienda (Tenant)',
      method: 'POST',
      url: '/api-system/v1/staff',
      headers: { host: 'tienda.localhost' },
      payload: { email: 'matrix-invite@tienda.com', roleId: 't1-inventory' },
      expected: { anon: 401, super: 401, master: 201, staff: 403 }
    }
  ];

  for (const route of matrix) {
    describe(route.name, () => {
      it('Anónimo → ' + route.expected.anon, async () => {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: { ...route.headers },
          payload: route.payload
        });
        expect(res.statusCode).toBe(route.expected.anon);
      });

      it('Superadmin → ' + route.expected.super, async () => {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: {
            ...route.headers,
            authorization: `Bearer ${superToken}`
          },
          payload: route.payload
        });
        expect(res.statusCode).toBe(route.expected.super);
      });

      it('Tenant Master → ' + route.expected.master, async () => {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: {
            ...route.headers,
            authorization: `Bearer ${t1MasterToken}`
          },
          payload: route.payload
        });
        expect(res.statusCode).toBe(route.expected.master);
      });

      it('Tenant Staff → ' + route.expected.staff, async () => {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: {
            ...route.headers,
            authorization: `Bearer ${t1StaffToken}`
          },
          payload: route.payload
        });
        expect(res.statusCode).toBe(route.expected.staff);
      });
    });
  }
});
