import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContractRepository } from '../../../infrastructure/no-code/contract.repository.js';
import { makePublishContract } from '../application/publish-contract.usecase.js';

const here = dirname(fileURLToPath(import.meta.url));
const TENANT_MIGRATIONS = join(here, '../../../config/drizzle/migrations/tenants');

const contract = (version = 'v1') => ({
  version,
  stores: { sql: { provider: 'neon', enabled: true } },
  resources: [{ name: 'products', store: 'sql', physicalName: 'products_db', fields: [{ id: 'f1', name: 'title', type: 'string', required: true }] }],
  endpoints: [{ path: '/products', resource: 'products', methods: ['GET'] }],
  auth: { userAuthEnabled: false },
});

let db;
let publish;
let repo;
beforeEach(() => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite);
  migrate(db, { migrationsFolder: TENANT_MIGRATIONS });
  repo = createContractRepository({ db });
  publish = makePublishContract({ contractRepository: repo, now: () => 1000 });
});

describe('publishContract (integración · backend_contracts)', () => {
  it('publica un contrato válido y queda como activo (schema parseado)', async () => {
    const res = await publish({ contract: contract('v1') });
    expect(res.version).toBe('v1');
    const active = repo.getActiveContract();
    expect(active).toMatchObject({ version: 'v1', status: 'published' });
    expect(active.schema.resources[0].name).toBe('products');
  });

  it('publicar v2 retira v1 (un solo contrato activo)', async () => {
    await publish({ contract: contract('v1') });
    await publish({ contract: contract('v2') });
    expect(repo.getActiveContract().version).toBe('v2');
    expect(repo.getByVersion('v1').status).toBe('retired');
  });

  it('rechaza un contrato inválido (no persiste nada)', async () => {
    await expect(publish({ contract: { version: 'v1' } })).rejects.toMatchObject({ code: 'INVALID_CONTRACT' });
    expect(repo.getActiveContract()).toBeNull();
  });
});
