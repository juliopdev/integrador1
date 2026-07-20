import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { env } from '../../../config/env.js';
import { migratePlatform } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers, tenants, plans, memberships, tenantStatusEvents } from '../../../config/drizzle/schema-platform.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

const EMAIL = 'super@baas.com';
const PASSWORD = 'Password123';
const PASSPHRASE = 'frase de paso larga';

let app;
let tmp;
let originalDir;
let accessToken;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-create-'));
  env.TENANTS_DB_DIR = tmp; // provision + pool LRU escriben/leen aquí

  const now = Date.now();
  platformDb
    .insert(platformUsers)
    .values({
      id: 'sa',
      email: EMAIL,
      passwordHash: await hashSecret(PASSWORD),
      passphraseHash: await hashSecret(PASSPHRASE),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  app = await buildApp();
  const login = await app.inject({
    method: 'POST',
    url: '/api-system/v1/login',
    payload: { email: EMAIL, password: PASSWORD, passphrase: PASSPHRASE },
  });
  accessToken = login.json().data.accessToken;
});

afterAll(async () => {
  await app?.close(); // cierra el pool LRU (libera los .db del temp)
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

function createTenant(payload, withAuth = true) {
  return app.inject({
    method: 'POST',
    url: '/api-system/v1/tenants',
    headers: withAuth ? { authorization: `Bearer ${accessToken}` } : {},
    payload,
  });
}

describe('POST /api-system/v1/tenants — alta completa (funcional)', () => {
  it('sin sesión de Superadmin → 403', async () => {
    const res = await createTenant({ subdomain: 'tienda', masterEmail: 'm@t.com' }, false);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('Superadmin crea tenant: 201 + tenant active + tenant.db con Master, rol y token', async () => {
    const res = await createTenant({ subdomain: 'tienda', masterEmail: 'master@tienda.com' });
    expect(res.statusCode).toBe(201);
    const { tenantId, subdomain } = res.json().data;
    expect(subdomain).toBe('tienda');

    // platform.db: tenant activo
    const t = platformDb.select().from(tenants).where(eq(tenants.id, tenantId)).get();
    expect(t).toMatchObject({ subdomain: 'tienda', status: 'active' });

    // tenant.db físico: Master invited + rol master + token de activación
    const dbPath = join(tmp, `${tenantId}.db`);
    expect(existsSync(dbPath)).toBe(true);
    const sqlite = new Database(dbPath);
    const master = sqlite.prepare('SELECT email, status, password_hash FROM tenant_users WHERE email = ?').get('master@tienda.com');
    const role = sqlite.prepare("SELECT name, category FROM roles WHERE name = 'master'").get();
    const tokens = sqlite.prepare('SELECT type FROM auth_tokens').all();
    sqlite.close();

    expect(master).toMatchObject({ email: 'master@tienda.com', status: 'invited', password_hash: null });
    expect(role).toMatchObject({ name: 'master', category: 'master' });
    expect(tokens).toEqual([{ type: 'activation' }]);
  });

  it('subdominio duplicado → 422 SUBDOMAIN_TAKEN', async () => {
    const res = await createTenant({ subdomain: 'tienda', masterEmail: 'otro@t.com' });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('SUBDOMAIN_TAKEN');
  });

  it('subdominio reservado → 422 RESERVED_SUBDOMAIN', async () => {
    const res = await createTenant({ subdomain: 'api', masterEmail: 'm@t.com' });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('RESERVED_SUBDOMAIN');
  });

  // P8: `expiresAt` fue retirado del alta. Los clientes que aún lo envíen deben ser tolerados
  // (Zod strip por default): la clave se descarta y el alta procede con vigencia derivada del plan.
  it('P8: alta ignora `expiresAt` si el cliente lo envía (backward-compat) → 201', async () => {
    const res = await createTenant({ subdomain: 'shop-a', masterEmail: 'a@shop.com', expiresAt: '2027-01-01' });
    expect(res.statusCode).toBe(201);
  });

  // P8: la vigencia del membership se DERIVA del plan (features.deployMonths). Premium = permanente.
  it('P8: alta con plan premium → membership.endsAt = null (permanente)', async () => {
    const premium = platformDb.select().from(plans).where(eq(plans.name, 'premium')).get();
    expect(premium).toBeTruthy();

    const res = await createTenant({
      subdomain: 'contratada',
      masterEmail: 'm@contratada.com',
      projectName: 'Tienda Contratada',
      planId: premium.id,
    });
    expect(res.statusCode).toBe(201);
    const { tenantId } = res.json().data;

    const t = platformDb.select().from(tenants).where(eq(tenants.id, tenantId)).get();
    expect(t.projectName).toBe('Tienda Contratada');

    const m = platformDb.select().from(memberships).where(eq(memberships.tenantId, tenantId)).get();
    expect(m).toMatchObject({ planId: premium.id });
    expect(m.endsAt).toBeNull(); // premium: deployMonths=null

    const events = platformDb.select().from(tenantStatusEvents).where(eq(tenantStatusEvents.tenantId, tenantId)).all();
    expect(events.map((e) => e.event)).toEqual(['created', 'enabled']);
  });

  // P8: standard tiene deployMonths=12 → endsAt ≈ startsAt + 12 meses calendario.
  it('P8: alta con plan standard → endsAt = startsAt + 12 meses', async () => {
    const standard = platformDb.select().from(plans).where(eq(plans.name, 'standard')).get();
    const before = Date.now();
    const res = await createTenant({ subdomain: 'estandarizada', masterEmail: 'm@estandarizada.com', planId: standard.id });
    expect(res.statusCode).toBe(201);
    const { tenantId } = res.json().data;

    const m = platformDb.select().from(memberships).where(eq(memberships.tenantId, tenantId)).get();
    // Ventana amplia para el jitter del test (segundos): +12 meses ≈ 365 días.
    const d = new Date(m.startsAt);
    d.setUTCMonth(d.getUTCMonth() + 12);
    expect(m.endsAt).toBe(d.getTime());
    expect(m.startsAt).toBeGreaterThanOrEqual(before);
  });

  it('P8: alta sin planId/projectName → defaults (plan basic, projectName = subdomain, 6 meses)', async () => {
    const res = await createTenant({ subdomain: 'pordefecto', masterEmail: 'm@pordefecto.com' });
    expect(res.statusCode).toBe(201);
    const { tenantId } = res.json().data;

    const t = platformDb.select().from(tenants).where(eq(tenants.id, tenantId)).get();
    expect(t.projectName).toBe('pordefecto');

    const basic = platformDb.select().from(plans).where(eq(plans.name, 'basic')).get();
    const m = platformDb.select().from(memberships).where(eq(memberships.tenantId, tenantId)).get();
    expect(m.planId).toBe(basic.id);
    const d = new Date(m.startsAt);
    d.setUTCMonth(d.getUTCMonth() + 6);
    expect(m.endsAt).toBe(d.getTime()); // basic: deployMonths=6
  });

  it('P2: planId inexistente → 422 PLAN_NOT_FOUND', async () => {
    const res = await createTenant({ subdomain: 'planmalo', masterEmail: 'm@planmalo.com', planId: 'no-existe' });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('PLAN_NOT_FOUND');
  });
});
