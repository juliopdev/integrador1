/**
 * Pruebas de seguridad específicas de API keys formato `mbk_`.
 * Cubre: aislamiento cross-tenant (key de tenant A no autentica en B),
 * revocación efectiva tras regeneración, formato inválido y ausencia
 * de header. Los endpoints del dispatcher exigen audiencia `user`.
 *
 * @module ApiKeySecurityTest
 * @see {@link ../../.doc/rules/tests.md §2C}
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../src/backend/config/env.js';
import { migratePlatform, migrateTenant } from '../../src/backend/config/drizzle/migrator.js';
import { platformDb } from '../../src/backend/config/database/platform/sqlite-platform.js';
import { platformUsers, tenants } from '../../src/backend/config/drizzle/schema-platform.js';
import { hashSecret } from '../../src/backend/common/password.js';
import { buildApp } from '../../src/backend/kernel/app.js';
import { makePublishContract } from '../../src/backend/feature/manage-platform-backend/application/publish-contract.usecase.js';
import { createContractRepository } from '../../src/backend/infrastructure/no-code/contract.repository.js';

// Pruebas de SEGURIDAD específicas de API keys `mbk_…` (categoría 5/8 · tests.md §2C).
// Cierran el gap que existía en `tenant-isolation-rbac.security.test.js`, que sólo cubre JWT
// scope y cookies — no la superficie API key. Escenarios cubiertos:
//
//   1. Aislamiento cross-tenant: key emitida para tenant A NO autentica sobre tenant B
//      (ni siquiera al dispatcher No-Code, que es el consumidor natural de la key).
//   2. Revocación efectiva: regenerar la key deja la vieja inutilizable inmediatamente.
//   3. Formato inválido: header sin `mbk_` prefijo, o key falsa, no cuentan como audiencia.
//
// Se usa un contrato con endpoint que exige `access: { GET: ['user'] }` para forzar el
// enforcement de audiencia. El store no está linkeado (503 STORE_NOT_CONFIGURED) — pero eso
// significa que la auth PASÓ (el dispatcher llegó al store). 401 = auth rechazada.

const SUPER_EMAIL = 'super@baas.com';
const PW = 'Password123';
const PP = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let superToken;
let keyA;
let keyB;

/**
 * Crea un tenant, migra su DB y publica un contrato v1 con endpoint
 * que exige audiencia `user` (para forzar el enforcement de API key).
 * @param {string} id - ID del tenant.
 * @param {string} subdomain - Subdominio del tenant.
 * @returns {Promise<void>}
 * @example
 * await seedTenantWithContract('t-a', 'tenant-a');
 */
async function seedTenantWithContract(id, subdomain) {
  const now = Date.now();
  platformDb.insert(tenants).values({ id, subdomain, status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant(id);
  const sqlite = new Database(join(tmp, `${id}.db`));
  await makePublishContract({ contractRepository: createContractRepository({ db: drizzle(sqlite) }) })({
    contract: {
      version: 'v1',
      stores: { sql: { provider: 'neon', enabled: true } },
      resources: [{
        // `physicalName` debe ser snake_case (regex `^[a-z][a-z0-9_]*$`) — usamos el subdomain
        // (que sí lo es) como prefijo, no el `id` que puede llevar guiones.
        name: 'items', store: 'sql', physicalName: `${subdomain.replace(/-/g, '_')}_items`,
        fields: [{ id: 'f1', name: 'title', type: 'string', required: true }],
      }],
      endpoints: [{ path: '/items', resource: 'items', methods: ['GET'], access: { GET: ['user'] } }],
      auth: { userAuthEnabled: false },
    },
  });
  sqlite.close();
}

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-apikey-sec-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(platformUsers).values({
    id: 'sa', email: SUPER_EMAIL,
    passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP),
    createdAt: now, updatedAt: now,
  }).run();

  await seedTenantWithContract('t-a', 'tenant-a');
  await seedTenantWithContract('t-b', 'tenant-b');

  app = await buildApp();
  const login = await app.inject({
    method: 'POST', url: '/api-system/v1/login',
    payload: { email: SUPER_EMAIL, password: PW, passphrase: PP },
  });
  superToken = login.json().data.accessToken;

  // Emitir keys de ambos tenants (Superadmin las gestiona desde el apex).
  const emitA = await app.inject({
    method: 'POST', url: '/api-system/v1/tenants/t-a/api-key',
    headers: { authorization: `Bearer ${superToken}` },
  });
  keyA = emitA.json().data.apiKey;
  const emitB = await app.inject({
    method: 'POST', url: '/api-system/v1/tenants/t-b/api-key',
    headers: { authorization: `Bearer ${superToken}` },
  });
  keyB = emitB.json().data.apiKey;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Helper que golpea el dispatcher No-Code GET /api/v1/items.
 * @param {string} subdomain - Subdominio del tenant (sin .localhost).
 * @param {string|null} apiKey - API key mbk_ o null para anónimo.
 * @returns {Promise<import('fastify').LightMyRequestResponse>} Respuesta de Fastify inject.
 * @example
 * const res = await hitDispatcher('tenant-a', keyA);
 */
const hitDispatcher = (subdomain, apiKey) => app.inject({
  method: 'GET', url: '/api/v1/items',
  headers: {
    host: `${subdomain}.localhost`,
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  },
});

describe('API key security — dispatcher No-Code `/api/v1/*`', () => {
  it('sanity: key propia del tenant pasa auth y llega al store (503 esperado sin Neon linkeado)', async () => {
    // Verifica que la key sí sirve para su propio tenant — sin esto no podríamos afirmar que
    // el rechazo cross-tenant es por AISLAMIENTO y no por otro motivo (bad request, etc.).
    const res = await hitDispatcher('tenant-a', keyA);
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('STORE_NOT_CONFIGURED');
  });

  it('CROSS-TENANT: key de tenant A contra dispatcher de tenant B → 401 UNAUTHORIZED', async () => {
    // Vector principal: si un tenant filtra su key, un atacante NO debe poder autenticar contra
    // otros tenants con ella. La búsqueda `findActiveByHash` corre en la DB del tenant B —
    // donde el hash de keyA no existe → nunca resuelve audiencia.
    const res = await hitDispatcher('tenant-b', keyA);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('CROSS-TENANT inverso: key de tenant B contra dispatcher de tenant A → 401', async () => {
    // El mismo vector en el sentido contrario — no vaya a ser que un bug en la ORM haga que
    // sólo un sentido esté protegido y el otro no.
    const res = await hitDispatcher('tenant-a', keyB);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('REVOCACIÓN: regenerar la key deja la anterior sin efecto (401 inmediato)', async () => {
    // Regeneramos la key de tenant A. La vieja (`keyA`) debe pasar a rechazarse ya, sin
    // esperar restart del servidor ni invalidación de caché.
    const regen = await app.inject({
      method: 'POST', url: '/api-system/v1/tenants/t-a/api-key',
      headers: { authorization: `Bearer ${superToken}` },
    });
    expect(regen.statusCode).toBe(201);
    const newKey = regen.json().data.apiKey;
    expect(newKey).not.toBe(keyA);

    // Vieja key → 401.
    const oldHit = await hitDispatcher('tenant-a', keyA);
    expect(oldHit.statusCode).toBe(401);
    expect(oldHit.json().code).toBe('UNAUTHORIZED');

    // Nueva key → pasa auth (503 al store como en el sanity).
    const newHit = await hitDispatcher('tenant-a', newKey);
    expect(newHit.statusCode).toBe(503);
    expect(newHit.json().code).toBe('STORE_NOT_CONFIGURED');
  });

  it('FORMATO INVÁLIDO: header sin `mbk_` prefijo o valor falso no cuenta como audiencia', async () => {
    // Un Bearer que no empiece con `mbk_` cae al path del JWT — como no es JWT válido, devuelve
    // null. Sin audiencia → 401. Este test blinda contra un cambio futuro que "olvide" el
    // prefijo y confunda tokens arbitrarios con API keys.
    const fake = await hitDispatcher('tenant-a', 'not-a-key-format-anything');
    expect(fake.statusCode).toBe(401);

    // `mbk_` con hash inventado tampoco autentica (findActiveByHash devuelve null).
    const fakeMbk = await hitDispatcher('tenant-a', 'mbk_this_is_not_a_real_hash_just_a_string');
    expect(fakeMbk.statusCode).toBe(401);

    // Sin header alguno → 401 (endpoint declara `access.GET = ['user']`).
    const anon = await hitDispatcher('tenant-a', null);
    expect(anon.statusCode).toBe(401);
  });
});
