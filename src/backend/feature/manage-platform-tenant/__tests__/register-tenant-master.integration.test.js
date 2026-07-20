import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { roles, tenantUsers, userRoles, authTokens } from '../../../config/drizzle/schema-tenant.js';
import { hashToken } from '../../../common/token.js';
import { createTenantOnboardingRepository } from '../infrastructure/tenant-onboarding.repository.js';
import { makeRegisterTenantMaster } from '../application/register-tenant-master.usecase.js';

const here = dirname(fileURLToPath(import.meta.url));
const TENANT_MIGRATIONS = join(here, '../../../config/drizzle/migrations/tenants');

let db;
beforeEach(() => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite);
  migrate(db, { migrationsFolder: TENANT_MIGRATIONS });
});

describe('registerTenantMaster (integración · tenant.db)', () => {
  it('crea rol master + usuario invited + asignación + token de activación', async () => {
    const repo = createTenantOnboardingRepository({ db });
    const uc = makeRegisterTenantMaster({ repository: repo, now: () => 1000 });

    const res = await uc({ email: 'master@tienda.com' });

    // usuario Master en estado invited, sin contraseña
    const user = db.select().from(tenantUsers).where(eq(tenantUsers.id, res.userId)).get();
    expect(user).toMatchObject({ email: 'master@tienda.com', status: 'invited', authProvider: 'local' });
    expect(user.passwordHash).toBeNull();

    // rol reservado master + asignación
    const role = db.select().from(roles).where(eq(roles.name, 'master')).get();
    expect(role).toMatchObject({ category: 'master', isReserved: 1 });
    const link = db.select().from(userRoles).where(eq(userRoles.userId, res.userId)).get();
    expect(link.roleId).toBe(role.id);

    // token de activación: se guarda el hash del crudo devuelto
    const token = db.select().from(authTokens).where(eq(authTokens.userId, res.userId)).get();
    expect(token).toMatchObject({ type: 'activation', tokenHash: hashToken(res.rawToken), expiresAt: 1000 + 7 * 24 * 60 * 60 * 1000 });
    expect(typeof res.rawToken).toBe('string');
  });

  it('reutiliza el rol master existente para un segundo Master', async () => {
    const repo = createTenantOnboardingRepository({ db });
    const uc = makeRegisterTenantMaster({ repository: repo });
    await uc({ email: 'a@tienda.com' });
    await uc({ email: 'b@tienda.com' });
    const allRoles = db.select().from(roles).where(eq(roles.name, 'master')).all();
    expect(allRoles).toHaveLength(1);
  });
});
