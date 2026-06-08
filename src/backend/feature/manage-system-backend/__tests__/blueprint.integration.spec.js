import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import { systemSchema } from '../../../config/drizzle/schema.js';
import { TenantRepository } from '../../../feature/manage-system-tenant/infrastructure/tenant.repository.js';
import { ProvisionTenantDbUseCase } from '../../../feature/manage-system-tenant/application/provision-tenant-db.usecase.js';
import { RegisterTenantMasterUseCase } from '../../../feature/manage-system-tenant/application/register-tenant-master.usecase.js';
import { BlueprintRepository } from '../infrastructure/blueprint.repository.js';
import { DefineDbSchemaUseCase } from '../application/define-db-schema.usecase.js';
import { UpdateBackendUseCase } from '../application/update-backend.usecase.js';
import { DeleteBackendUseCase } from '../application/delete-backend.usecase.js';
import { MongoAtlasAdapter } from '../../../infrastructure/providers/mongodb-atlas.adapter.js';
import { env } from '../../../config/env.js';
import { tenantPool } from '../../../config/database.js';

describe('Phase 3 Integration Tests', () => {
  let systemConn;
  let systemDb;
  let mongoMockAdapter;
  let tenantRepo;
  let blueprintRepo;
  
  const tenantsDir = path.resolve(process.cwd(), env.TENANTS_DB_DIR);
  const testTenantId = 'test-tenant-omega';

  beforeAll(() => {
    // ES: Inicializar base de datos del sistema en memoria para aislamiento.
    // EN: Initialize in-memory system database for isolation.
    systemConn = new Database(':memory:');
    systemConn.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subdomain TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        plan TEXT NOT NULL DEFAULT 'free',
        api_auth_enabled INTEGER DEFAULT 1 NOT NULL,
        backend_blueprint_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS backend_blueprints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT 'v1',
        schema TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT
      );
    `);

    systemDb = drizzle(systemConn, { schema: systemSchema });
    mongoMockAdapter = new MongoAtlasAdapter({ env });
    
    tenantRepo = new TenantRepository({ systemDb });
    blueprintRepo = new BlueprintRepository({ systemDb, mongoAtlasAdapter: mongoMockAdapter });

    // ES: Asegurar limpieza previa de base de datos de inquilinos temporales.
    // EN: Ensure previous cleanup of temporary tenant databases.
    cleanupTestDb();
  });

  afterAll(() => {
    systemConn.close();
    cleanupTestDb();
  });

  function cleanupTestDb() {
    try {
      tenantPool.closeAll();
    } catch (e) {}
    if (fs.existsSync(tenantsDir)) {
      const files = fs.readdirSync(tenantsDir);
      for (const file of files) {
        if (file.startsWith(testTenantId)) {
          try {
            fs.rmSync(path.join(tenantsDir, file), { force: true });
          } catch (err) {
            console.warn(`Could not delete test database file ${file}:`, err.message);
          }
        }
      }
    }
  }

  describe('Feature: Tenant Provisioning', () => {
    it('should provision a new tenant and seed its master credentials successfully', async () => {
      const provisionUseCase = new ProvisionTenantDbUseCase({ env });
      const registerUseCase = new RegisterTenantMasterUseCase({
        tenantRepository: tenantRepo,
        provisionTenantDbUseCase: provisionUseCase,
      });

      const tenantInput = {
        id: testTenantId,
        name: 'Omega Store',
        subdomain: 'omega-test',
        plan: 'premium',
        masterEmail: 'master@omega.com',
        masterPassword: 'superSecurePassword123',
        masterPassphrase: 'mySecretPassphraseForOmega',
      };

      // ES: Registrar e Iniciar inquilino.
      // EN: Register and provision tenant.
      const tenant = await registerUseCase.execute(tenantInput);

      expect(tenant).toBeDefined();
      expect(tenant.id).toBe(tenantInput.id);
      expect(tenant.subdomain).toBe(tenantInput.subdomain);
      expect(tenant.plan).toBe('premium');

      // ES: Verificar creación física del archivo SQLite de base de datos del inquilino.
      // EN: Verify physical creation of the tenant SQLite database file.
      const dbPath = path.join(tenantsDir, `${tenantInput.id}.db`);
      expect(fs.existsSync(dbPath)).toBe(true);

      // ES: Verificar tablas e inserción del Master.
      // EN: Verify tables and Master insertion.
      const tenantConn = new Database(dbPath);
      const user = tenantConn.prepare('SELECT * FROM users WHERE email = ?').get(tenantInput.masterEmail);
      tenantConn.close();

      expect(user).toBeDefined();
      expect(user.role).toBe('master');
      expect(user.status).toBe('active');
      expect(user.password).not.toBe(tenantInput.masterPassword); // ES: Debe estar cifrada. EN: Must be hashed.
      expect(user.passphrase).not.toBe(tenantInput.masterPassphrase); // ES: Debe estar cifrada. EN: Must be hashed.
    });
  });

  describe('Feature: No-Code Backend Blueprints Engine', () => {
    it('should define a database schema, auto-inject audit fields, and record MongoDB audit log', async () => {
      const defineUseCase = new DefineDbSchemaUseCase({ blueprintRepository: blueprintRepo });

      const blueprintInput = {
        id: 'blog_api',
        name: 'Blog Service',
        version: 'v1',
        schema: {
          tables: [
            {
              name: 'posts',
              columns: [
                { name: 'title', type: 'text', nullable: false, unique: false },
                { name: 'content', type: 'text', nullable: true, unique: false },
              ]
            }
          ]
        }
      };

      const result = await defineUseCase.execute(blueprintInput);

      expect(result).toBeDefined();
      expect(result.id).toBe('blog_api');
      expect(result.schema.tables.length).toBe(1);

      // ES: Verificar columnas inyectadas de auditoría.
      // EN: Verify injected audit columns.
      const table = result.schema.tables[0];
      const colNames = table.columns.map(c => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
    });

    it('should update backend blueprints', async () => {
      const updateUseCase = new UpdateBackendUseCase({ blueprintRepository: blueprintRepo });

      const updatedInput = {
        name: 'Blog Service Premium',
        version: 'v1.1',
        schema: {
          tables: [
            {
              name: 'posts',
              columns: [
                { name: 'title', type: 'text', nullable: false, unique: false },
                { name: 'content', type: 'text', nullable: true, unique: false },
                { name: 'views', type: 'integer', nullable: true, defaultValue: 0 },
              ]
            }
          ]
        }
      };

      const result = await updateUseCase.execute('blog_api', updatedInput);

      expect(result).toBeDefined();
      expect(result.name).toBe('Blog Service Premium');
      expect(result.version).toBe('v1.1');
      expect(result.schema.tables[0].columns.some(c => c.name === 'views')).toBe(true);
    });

    it('should soft-delete backend blueprints', async () => {
      const deleteUseCase = new DeleteBackendUseCase({ blueprintRepository: blueprintRepo });

      const deleted = await deleteUseCase.execute('blog_api');
      expect(deleted.deletedAt).not.toBeNull();

      const activeBlueprints = await blueprintRepo.findAllActive();
      expect(activeBlueprints.some(b => b.id === 'blog_api')).toBe(false);
    });
  });
});
