import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../../kernel/app.js';
import { systemDb, getTenantDb, systemDbConnection, tenantPool } from '../../../config/database.js';
import { admins, tenants, users } from '../../../config/drizzle/schema.js';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

describe('Admin Dashboard Home Integration Tests', () => {
  const superadminEmail = 'super-dashboard@saas.com';
  const superadminPassword = 'password123';
  const superadminPassphrase = 'superpassphrase';

  const tenantId = 'tenant_dashboard_test';
  const tenantName = 'Dashboard Test Tenant';
  const tenantSubdomain = 'tenant-dashboard-test';

  const masterEmail = 'master@tenantdashboard.com';
  const masterPassword = 'password123';
  const masterPassphrase = 'masterpassphrase';

  beforeAll(async () => {
    // ES: Asegurar estructura básica de tablas del sistema y semillas.
    // EN: Ensure basic system table structure and seed data.
    systemDbConnection.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        passphrase TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'superadmin',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subdomain TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        plan TEXT NOT NULL DEFAULT 'free',
        api_auth_enabled INTEGER NOT NULL DEFAULT 1,
        backend_blueprint_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const tenantsDir = path.resolve(process.cwd(), 'data/tenants');
    if (!fs.existsSync(tenantsDir)) {
      fs.mkdirSync(tenantsDir, { recursive: true });
    }

    const tenantDbPath = path.join(tenantsDir, `${tenantId}.db`);
    const tenantSqlite = new Database(tenantDbPath);
    tenantSqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        passphrase TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    tenantSqlite.close();

    await app.ready();

    // ES: Limpiar registros previos con el mismo email para evitar colisiones.
    // EN: Clear previous records with the same email to avoid collisions.
    const { eq, or } = await import('drizzle-orm');
    await systemDb.delete(admins).where(eq(admins.email, superadminEmail));
    await systemDb.delete(tenants).where(
      or(
        eq(tenants.id, tenantId),
        eq(tenants.id, 'different-tenant-id')
      )
    );
    
    const tenantDb = getTenantDb(tenantId);
    await tenantDb.delete(users).where(eq(users.email, masterEmail));

    // ES: Hashear e insertar semillas.
    // EN: Hash and insert seed data.
    const hashedSuperPassword = await bcrypt.hash(superadminPassword, 10);
    const hashedSuperPassphrase = await bcrypt.hash(superadminPassphrase, 10);
    const hashedMasterPassword = await bcrypt.hash(masterPassword, 10);
    const hashedMasterPassphrase = await bcrypt.hash(masterPassphrase, 10);

    await systemDb.insert(admins).values({
      email: superadminEmail,
      password: hashedSuperPassword,
      passphrase: hashedSuperPassphrase,
      role: 'superadmin',
    });

    await systemDb.insert(tenants).values({
      id: tenantId,
      name: tenantName,
      subdomain: tenantSubdomain,
      status: 'active',
      apiAuthEnabled: 1,
    });

    await systemDb.insert(tenants).values({
      id: 'different-tenant-id',
      name: 'Different Tenant',
      subdomain: 'different-subdomain',
      status: 'active',
      apiAuthEnabled: 1,
    });

    await tenantDb.insert(users).values({
      email: masterEmail,
      password: hashedMasterPassword,
      passphrase: hashedMasterPassphrase,
      role: 'master',
      status: 'active',
    });
  });

  afterAll(async () => {
    // ES: Remover archivo físico de base de datos de inquilino de prueba.
    // EN: Remove physical test tenant database file.
    tenantPool.closeAll();
    const tenantsDir = path.resolve(process.cwd(), 'data/tenants');
    const dbPath = path.join(tenantsDir, `${tenantId}.db`);
    if (fs.existsSync(dbPath)) {
      try { fs.rmSync(dbPath, { force: true }); } catch (e) {}
    }
  });

  it('should redirect to login if no access token cookie is present', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/dashboard/login');
  });

  it('should serve system dashboard for authenticated superadmin', async () => {
    // 1. Iniciar sesión como Superadmin para obtener las cookies.
    const loginRes = await app.inject({
      method: 'POST',
      url: '/dashboard/login',
      payload: {
        email: superadminEmail,
        password: superadminPassword,
        passphrase: superadminPassphrase,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const cookiesHeader = loginRes.headers['set-cookie'];
    expect(cookiesHeader).toBeDefined();

    // 2. Extraer access_token de las cookies.
    const accessTokenCookie = cookiesHeader.find(c => c.startsWith('access_token='));
    expect(accessTokenCookie).toBeDefined();

    // 3. Solicitar dashboard con el token de acceso.
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        'Cookie': accessTokenCookie,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Superadmin');
    expect(response.body).toContain('Mi Baas Platform');
  });

  it('should serve tenant dashboard for authenticated master on matching subdomain', async () => {
    // 1. Iniciar sesión como Master.
    const loginRes = await app.inject({
      method: 'POST',
      url: '/dashboard/login',
      headers: {
        'x-tenant-id': tenantSubdomain,
      },
      payload: {
        email: masterEmail,
        password: masterPassword,
        passphrase: masterPassphrase,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const cookiesHeader = loginRes.headers['set-cookie'];
    const accessTokenCookie = cookiesHeader.find(c => c.startsWith('access_token='));

    // 2. Solicitar dashboard con cookie e inquilino correcto.
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        'Cookie': accessTokenCookie,
        'x-tenant-id': tenantSubdomain,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(tenantName);
    expect(response.body).toContain('master');
  });

  it('should return 403 Forbidden if master attempts to access dashboard without matching subdomain', async () => {
    // 1. Iniciar sesión como Master.
    const loginRes = await app.inject({
      method: 'POST',
      url: '/dashboard/login',
      headers: {
        'x-tenant-id': tenantSubdomain,
      },
      payload: {
        email: masterEmail,
        password: masterPassword,
        passphrase: masterPassphrase,
      },
    });

    const cookiesHeader = loginRes.headers['set-cookie'];
    const accessTokenCookie = cookiesHeader.find(c => c.startsWith('access_token='));

    // 2. Solicitar dashboard con cookie pero sin header de subdominio (o uno incorrecto).
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        'Cookie': accessTokenCookie,
        'x-tenant-id': 'different-subdomain',
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
