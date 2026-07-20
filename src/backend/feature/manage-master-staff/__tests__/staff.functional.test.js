/**
 * Pruebas funcionales del feature manage-master-staff.
 * Cubre: Master invita colaborador → 201, RBAC (Staff no invita → 403),
 * colaborador invitado activa con token de invitación → 200.
 *
 * @module ManageMasterStaffFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../../config/env.js';
import { migratePlatform, migrateTenant } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { tenants } from '../../../config/drizzle/schema-platform.js';
import { roles, tenantUsers, userRoles } from '../../../config/drizzle/schema-tenant.js';
import { hashSecret } from '../../../common/password.js';
import { createStaffRepository } from '../infrastructure/staff.repository.js';
import { makeInviteStaff } from '../application/invite-staff.usecase.js';
import { buildApp } from '../../../kernel/app.js';

const PW = 'Password123';
const PP = 'frase de paso larga';
const R_STAFF = 'r-inventory';

let app;
let tmp;
let originalDir;
let masterToken;
let staffToken;
let inviteeToken;

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
  db.insert(tenantUsers).values({ id, email, passwordHash: await hashSecret(PW), passphraseHash: await hashSecret(PP), status: 'active', createdAt: now, updatedAt: now }).run();
  db.insert(userRoles).values({ userId: id, roleId, assignedAt: now }).run();
}

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-staff-'));
  env.TENANTS_DB_DIR = tmp;

  const now = Date.now();
  platformDb.insert(tenants).values({ id: 't1', subdomain: 'tienda', status: 'active', createdAt: now, updatedAt: now }).run();
  migrateTenant('t1');

  const sqlite = new Database(join(tmp, 't1.db'));
  const db = drizzle(sqlite);
  db.insert(roles).values([
    { id: 'r-master', name: 'master', category: 'master', isReserved: 1, createdAt: now, updatedAt: now },
    { id: R_STAFF, name: 'inventory', category: 'staff', isReserved: 0, createdAt: now, updatedAt: now },
  ]).run();
  await seedUser(db, { id: 'u-master', email: 'master@tienda.com', roleId: 'r-master', now });
  await seedUser(db, { id: 'u-staff', email: 'staff@tienda.com', roleId: R_STAFF, now });
  // colaborador invitado (pendiente) para probar la activación con token de invitación
  const invite = makeInviteStaff({ staffRepository: createStaffRepository({ db }), mailer: { sendMail: async () => ({}) }, appBaseUrl: env.APP_URL, subdomain: 'tienda' });
  ({ rawToken: inviteeToken } = await invite({ email: 'invitee@tienda.com', roleId: R_STAFF }));
  sqlite.close();

  app = await buildApp();
  const loginOn = (email) => app.inject({ method: 'POST', url: '/api-system/v1/login', headers: { host: 'tienda.localhost' }, payload: { email, password: PW, passphrase: PP } });
  masterToken = (await loginOn('master@tienda.com')).json().data.accessToken;
  staffToken = (await loginOn('staff@tienda.com')).json().data.accessToken;
});

afterAll(async () => {
  await app?.close();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Helper que invita a un colaborador via POST /api-system/v1/staff.
 * @param {string|null} token - Bearer JWT o null para anónimo.
 * @param {Object} payload - Datos de invitación ({ email, roleId }).
 * @returns {Promise<import('fastify').LightMyRequestResponse>}
 */
function invite(token, payload) {
  return app.inject({
    method: 'POST',
    url: '/api-system/v1/staff',
    headers: { host: 'tienda.localhost', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    payload,
  });
}

describe('manage-master-staff (funcional)', () => {
  it('el Master invita a un colaborador → 201 + usuario invited en el tenant.db', async () => {
    const res = await invite(masterToken, { email: 'nuevo@tienda.com', roleId: R_STAFF });
    expect(res.statusCode).toBe(201);
    const dbPath = join(tmp, 't1.db');
    const sqlite = new Database(dbPath);
    const u = sqlite.prepare('SELECT email, status FROM tenant_users WHERE email = ?').get('nuevo@tienda.com');
    sqlite.close();
    expect(u).toMatchObject({ email: 'nuevo@tienda.com', status: 'invited' });
  });

  it('rbac: un Staff NO puede invitar → 403', async () => {
    const res = await invite(staffToken, { email: 'otro@tienda.com', roleId: R_STAFF });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });



  it('el colaborador invitado activa su cuenta con el token de invitación → 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api-system/v1/login',
      headers: { host: 'tienda.localhost' },
      payload: { token: inviteeToken, password: PW, passphrase: PP },
    });
    expect(res.statusCode).toBe(200);
  });
});
