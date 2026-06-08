import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../../kernel/app.js';
import { systemDb, getTenantDb, systemDbConnection, tenantPool } from '../../../config/database.js';
import { admins, tenants, users } from '../../../config/drizzle/schema.js';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

describe('Authentication Matrix Integration Tests', () => {
  const superadminEmail = 'super@saas.com';
  const superadminPassword = 'password123';
  const superadminPassphrase = 'superpassphrase';

  const tenantId = 'tenant_test';
  const tenantName = 'Test Tenant';
  const tenantSubdomain = 'tenant-test';

  const masterEmail = 'master@tenant.com';
  const masterPassword = 'password123';
  const masterPassphrase = 'masterpassphrase';

  const userEmail = 'user@tenant.com';
  const userPassword = 'password123';

  beforeAll(async () => {
    // ES: 1. Crear tablas programáticamente con columna passphrase para asegurar un entorno consistente.
    // EN: 1. Create tables programmatically with passphrase column to ensure a consistent test environment.
    systemDbConnection.exec(`
      DROP TABLE IF EXISTS admins;
      DROP TABLE IF EXISTS tenants;

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

    // ES: Asegurar directorio de base de datos de inquilinos.
    // EN: Ensure tenant database folder exists.
    const tenantsDir = path.resolve(process.cwd(), 'data/tenants');
    if (!fs.existsSync(tenantsDir)) {
      fs.mkdirSync(tenantsDir, { recursive: true });
    }

    const tenantDbPath = path.join(tenantsDir, `${tenantId}.db`);
    const tenantSqlite = new Database(tenantDbPath);
    tenantSqlite.exec(`
      DROP TABLE IF EXISTS users;

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

    // ES: 2. Esperar a que Fastify cargue todos los plugins.
    // EN: 2. Wait for Fastify to fully load plugins.
    await app.ready();

    // ES: 3. Limpiar registros de pruebas previas.
    // EN: 3. Clean records from previous test runs.
    await systemDb.delete(admins);
    await systemDb.delete(tenants);

    const tenantDb = getTenantDb(tenantId);
    await tenantDb.delete(users);

    // ES: 4. Hashear contraseñas y frases de seguridad, e insertar registros semilla.
    // EN: 4. Hash passwords and passphrases, and seed test records.
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

    await tenantDb.insert(users).values({
      email: masterEmail,
      password: hashedMasterPassword,
      passphrase: hashedMasterPassphrase,
      role: 'master',
      status: 'active',
    });
  });

  afterAll(async () => {
    // ES: Cerrar conexiones abiertas de base de datos y apagar servidor Fastify.
    // EN: Close active database connections and shut down Fastify server.
    systemDbConnection.close();
    tenantPool.closeAll();
    await app.close();
  });

  it('should authenticate Superadmin on main domain providing valid email, password, and passphrase', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/dashboard/login',
      headers: {
        'Accept': 'application/json',
      },
      payload: {
        email: superadminEmail,
        password: superadminPassword,
        passphrase: superadminPassphrase,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.admin.email).toBe(superadminEmail);
    expect(body.admin.role).toBe('superadmin');
  });

  it('should authenticate Master on tenant subdomain providing email, password, and passphrase', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/dashboard/login',
      headers: {
        'Accept': 'application/json',
        'x-tenant-id': tenantSubdomain,
      },
      payload: {
        email: masterEmail,
        password: masterPassword,
        passphrase: masterPassphrase,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.admin.email).toBe(masterEmail);
    expect(body.admin.role).toBe('master');
  });

  it('should register and then login a tenant end-user via API using only email and password', async () => {
    // ES: Pruebas de registro (POST /api/v1/register) - sin frase de seguridad.
    // EN: Register tests (POST /api/v1/register) - no passphrase.
    const regResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/register',
      headers: {
        'x-tenant-id': tenantSubdomain,
      },
      payload: {
        email: userEmail,
        password: userPassword,
      },
    });

    expect(regResponse.statusCode).toBe(200);
    const regBody = JSON.parse(regResponse.body);
    expect(regBody.success).toBe(true);
    expect(regBody.user.email).toBe(userEmail);
    expect(regBody.user.role).toBe('user');

    // ES: Pruebas de login (POST /api/v1/login) - sin frase de seguridad.
    // EN: Login tests (POST /api/v1/login) - no passphrase.
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/login',
      headers: {
        'x-tenant-id': tenantSubdomain,
      },
      payload: {
        email: userEmail,
        password: userPassword,
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = JSON.parse(loginResponse.body);
    expect(loginBody.success).toBe(true);
    expect(loginBody.accessToken).toBeDefined();
    expect(loginBody.refreshToken).toBeDefined();
  });

  it('should return HTTP 503 if tenant has apiAuthEnabled disabled', async () => {
    const { eq } = await import('drizzle-orm');
    await systemDb
      .update(tenants)
      .set({ apiAuthEnabled: 0 })
      .where(eq(tenants.id, tenantId));

    const regResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/register',
      headers: {
        'x-tenant-id': tenantSubdomain,
      },
      payload: {
        email: 'another_user@tenant.com',
        password: 'password123',
      },
    });

    expect(regResponse.statusCode).toBe(503);
    const regBody = JSON.parse(regResponse.body);
    expect(regBody.success).toBe(false);
    expect(regBody.error).toBe('Service Unavailable');
  });
});
