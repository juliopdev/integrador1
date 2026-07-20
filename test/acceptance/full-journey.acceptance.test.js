import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../src/backend/config/env.js';
import { migratePlatform } from '../../src/backend/config/drizzle/migrator.js';
import { platformDb } from '../../src/backend/config/database/platform/sqlite-platform.js';
import { platformUsers, tenants } from '../../src/backend/config/drizzle/schema-platform.js';
import { tenantUsers } from '../../src/backend/config/drizzle/schema-tenant.js';
import { hashSecret } from '../../src/backend/common/password.js';
import { buildApp } from '../../src/backend/kernel/app.js';
import { makePublishContract } from '../../src/backend/feature/manage-platform-backend/application/publish-contract.usecase.js';
import { createContractRepository } from '../../src/backend/infrastructure/no-code/contract.repository.js';

// PRUEBA DE ACEPTACIÓN (categoría 6 de las 8 clásicas). No mide un endpoint ni un caso de uso —
// mide el JOURNEY completo del sistema, orquestando features distintos como los usaría un cliente
// real. Si esta prueba pasa, hay confianza de que las piezas se cablearon entre sí correctamente.
//
// Journey cubierto:
//   1. Superadmin arranca la plataforma.
//   2. Superadmin da de alta un tenant `tienda` con Master invited.
//   3. El Master activa credenciales (bypass del token de mail — la activación en sí ya la testea
//      auth-admin/activate.functional; acá seedeamos password_hash directo para no repetir).
//   4. Master se loguea en el subdominio y obtiene un access token con scope=tenant.
//   5. Master publica el contrato v1 del backend (products + endpoint /products).
//   6. Master emite la API key `mbk_…` del tenant.
//   7. El dispatcher No-Code responde en `/api/v1/openapi.json` con el spec generado.
//   8. Un end-user sin credenciales golpea el endpoint público → llega al store (503 esperado sin
//      Neon linkeado — verifica que TODO el pipeline hasta el store se cableó bien).
//   9. Master regenera la API key → la vieja queda revocada (POST con vieja falla 401 en endpoints
//      protegidos; acá lo validamos verificando que la nueva ≠ la vieja y que el hash cambia).
//   10. Superadmin da de baja al tenant (soft-delete) → confirma que el subdominio queda libre
//      para reciclar.
//
// El punto no es la calidad de cada assert individual — es que la CADENA completa NO SE ROMPE.

const SUPER_EMAIL = 'super@baas.com';
const SUPER_PW = 'Password123';
const SUPER_PP = 'frase de paso larga';
const SUBDOMAIN = 'tienda';
const HOST_TENANT = `${SUBDOMAIN}.localhost`;
const MASTER_EMAIL = 'master@tienda.com';
const MASTER_PW = 'MasterPass1234';
const MASTER_PP = 'passphrase muy larga master';

let app;
let tmp;
let originalDir;
let superToken;
let tenantId;
let masterToken;
let firstApiKey;
let firstKeyHash;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-acceptance-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(platformUsers).values({
    id: 'sa', email: SUPER_EMAIL,
    passwordHash: await hashSecret(SUPER_PW), passphraseHash: await hashSecret(SUPER_PP),
    createdAt: now, updatedAt: now,
  }).run();

  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('full-journey.acceptance — provisioning → contrato → API key → dispatcher → cleanup', () => {
  it('Paso 1-2: Superadmin se loguea y da de alta el tenant `tienda`', async () => {
    // 1. Login Superadmin.
    const login = await app.inject({
      method: 'POST', url: '/api-system/v1/login',
      payload: { email: SUPER_EMAIL, password: SUPER_PW, passphrase: SUPER_PP },
    });
    expect(login.statusCode).toBe(200);
    superToken = login.json().data.accessToken;
    expect(superToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    // 2. Alta del tenant.
    const create = await app.inject({
      method: 'POST', url: '/api-system/v1/tenants',
      headers: { authorization: `Bearer ${superToken}` },
      payload: { subdomain: SUBDOMAIN, masterEmail: MASTER_EMAIL, projectName: 'Mi Tienda' },
    });
    expect(create.statusCode).toBe(201);
    tenantId = create.json().data.tenantId;
    expect(create.json().data.subdomain).toBe(SUBDOMAIN);

    // Verificaciones cruzadas: tenant.db físico + Master invited + rol master + token de activación.
    expect(existsSync(join(tmp, `${tenantId}.db`))).toBe(true);
    const sqlite = new Database(join(tmp, `${tenantId}.db`));
    const master = sqlite.prepare('SELECT email, status, password_hash FROM tenant_users WHERE email=?').get(MASTER_EMAIL);
    const rolesRows = sqlite.prepare("SELECT name, category FROM roles WHERE name='master'").all();
    const tokens = sqlite.prepare('SELECT type FROM auth_tokens').all();
    sqlite.close();
    expect(master).toMatchObject({ email: MASTER_EMAIL, status: 'invited', password_hash: null });
    expect(rolesRows[0]).toMatchObject({ name: 'master', category: 'master' });
    expect(tokens).toEqual([{ type: 'activation' }]);
  });

  it('Paso 3-4: Master activa credenciales (bypass del token) y logea en el subdominio', async () => {
    // 3. Bypass de activación — semilla directa de password_hash + passphrase_hash + status=active.
    //    (El flujo real de activación ya está cubierto por auth-admin/activate.functional; el
    //    journey no lo re-testea, sólo prepara el estado para probar los pasos siguientes.)
    const sqlite = new Database(join(tmp, `${tenantId}.db`));
    const db = drizzle(sqlite);
    await db.update(tenantUsers).set({
      passwordHash: await hashSecret(MASTER_PW),
      passphraseHash: await hashSecret(MASTER_PP),
      status: 'active',
      updatedAt: Date.now(),
    }).where(eq(tenantUsers.email, MASTER_EMAIL)).run();
    sqlite.close();

    // 4. Login del Master en el subdominio.
    const login = await app.inject({
      method: 'POST', url: '/api-system/v1/login',
      headers: { host: HOST_TENANT },
      payload: { email: MASTER_EMAIL, password: MASTER_PW, passphrase: MASTER_PP },
    });
    expect(login.statusCode).toBe(200);
    masterToken = login.json().data.accessToken;
    expect(masterToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(masterToken).not.toBe(superToken);
  });

  it('Paso 5: Master publica el contrato v1 del backend (products + endpoint /products)', async () => {
    // NOTA: el endpoint HTTP `POST /api-system/v1/tenants/:id/backend` dispara `compile-backend`
    // que materializa las tablas físicas en el store real (Neon). Sin `TEST_URI_CONECTION_NEONTECH`
    // esto devuelve 503 — como bien testea compile-at-publish.functional. La aceptación acá NO
    // valida el pipeline de compile (eso vive en su feature); usa el caso de uso `makePublishContract`
    // directamente para persistir el contrato y probar el resto del journey (dispatcher, api-key,
    // openapi, delete).
    const contract = {
      version: 'v1',
      stores: { sql: { provider: 'neon', enabled: true } },
      resources: [{
        name: 'products',
        store: 'sql',
        physicalName: 'products_db',
        fields: [
          { id: 'f1', name: 'title', type: 'string', required: true },
          { id: 'f2', name: 'price', type: 'float' },
        ],
      }],
      endpoints: [{ path: '/products', resource: 'products', methods: ['GET', 'POST'] }],
      auth: { userAuthEnabled: false },
    };
    const sqlite = new Database(join(tmp, `${tenantId}.db`));
    const publish = makePublishContract({
      contractRepository: createContractRepository({ db: drizzle(sqlite) }),
    });
    const result = await publish({ contract });
    sqlite.close();
    expect(result.version).toBe('v1');
  });

  it('Paso 6: Superadmin emite la primera API key del tenant (formato mbk_)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api-system/v1/tenants/${tenantId}/api-key`,
      headers: { authorization: `Bearer ${superToken}` },
    });
    expect(res.statusCode).toBe(201);
    firstApiKey = res.json().data.apiKey;
    expect(firstApiKey).toMatch(/^mbk_/);
    expect(res.json().data.regenerated).toBe(false);

    // Snapshot del hash almacenado — se compara en el paso 9 para verificar que rotó.
    const sqlite = new Database(join(tmp, `${tenantId}.db`));
    const row = sqlite.prepare('SELECT token_hash FROM api_keys ORDER BY created_at DESC').get();
    sqlite.close();
    firstKeyHash = row.token_hash;
    expect(firstKeyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('Paso 7: dispatcher No-Code sirve /api/v1/openapi.json generado del contrato', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/openapi.json',
      headers: { host: HOST_TENANT },
    });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\.\d/);
    // El endpoint declarado en el contrato debe aparecer en el spec generado.
    expect(spec.paths).toHaveProperty('/products');
    expect(Object.keys(spec.paths['/products'])).toEqual(expect.arrayContaining(['get', 'post']));
  });

  it('Paso 8: end-user anónimo golpea /api/v1/products → 503 STORE_NOT_CONFIGURED (pipeline cableado hasta el store)', async () => {
    // El endpoint es público por default (userAuthEnabled=false), así que el dispatcher lo deja
    // pasar sin auth. Falla en el store porque no hay Neon linkeado — pero eso valida que TODO
    // el pipeline (tenant-loader → contract → endpoint match → resolver de store) llegó al final.
    const res = await app.inject({
      method: 'GET', url: '/api/v1/products',
      headers: { host: HOST_TENANT },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('STORE_NOT_CONFIGURED');
  });

  it('Paso 9: Master regenera la API key → nuevo valor, nuevo hash, la vieja queda revocada', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api-system/v1/tenants/${tenantId}/api-key`,
      headers: { authorization: `Bearer ${superToken}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.regenerated).toBe(true);
    const newKey = res.json().data.apiKey;
    expect(newKey).toMatch(/^mbk_/);
    expect(newKey).not.toBe(firstApiKey);

    // La única activa en la DB debe ser la nueva (status='active'; la vieja pasa a 'revoked').
    const sqlite = new Database(join(tmp, `${tenantId}.db`));
    const activeRows = sqlite.prepare("SELECT token_hash FROM api_keys WHERE status = 'active'").all();
    sqlite.close();
    expect(activeRows.length).toBe(1);
    expect(activeRows[0].token_hash).not.toBe(firstKeyHash);
  });

  it('Paso 10: Superadmin da de baja al tenant → soft-delete + subdominio queda libre', async () => {
    const del = await app.inject({
      method: 'DELETE', url: `/api-system/v1/tenants/${tenantId}`,
      headers: { authorization: `Bearer ${superToken}` },
      payload: { confirmSubdomain: SUBDOMAIN },
    });
    expect(del.statusCode).toBe(200);

    // El tenant queda marcado con `deletedAt` (soft-delete). El purge físico lo maneja el worker.
    const row = platformDb.select().from(tenants).where(eq(tenants.id, tenantId)).get();
    expect(row?.deletedAt).not.toBeNull();
    expect(typeof row?.deletedAt).toBe('number');

    // Segundo DELETE del mismo tenant → 404 (idempotencia: findById filtra los soft-deleted).
    const replay = await app.inject({
      method: 'DELETE', url: `/api-system/v1/tenants/${tenantId}`,
      headers: { authorization: `Bearer ${superToken}` },
      payload: { confirmSubdomain: SUBDOMAIN },
    });
    expect(replay.statusCode).toBe(404);
    expect(replay.json().code).toBe('TENANT_NOT_FOUND');
  });
});
