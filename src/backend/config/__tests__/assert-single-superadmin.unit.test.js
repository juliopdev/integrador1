/**
 * Pruebas unitarias de la guarda assertSingleSuperadmin.
 * Verifica que la función advierte (console.warn) cuando hay más de un
 * superadmin activo en production, y que soft-delete y NODE_ENV=test
 * son ignorados correctamente.
 *
 * @module ConfigAssertSingleSuperadminUnitTest
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { migratePlatform } from '../drizzle/migrator.js';
import { platformDb } from '../database/platform/sqlite-platform.js';
import { platformUsers } from '../drizzle/schema-platform.js';
import { assertSingleSuperadmin } from '../seed-superadmin.js';
import { env } from '../env.js';

// Regresión del incidente 2026-07-17 (leak de test `d@d.com` con id='sa' a platform.db real).
// La guarda debe imprimir un WARN cuando arranque con >1 superadmin activo — sin crashear.

describe('assertSingleSuperadmin — guarda de invariante', () => {
  let originalEnv;
  let warnSpy;

  beforeEach(() => {
    originalEnv = env.NODE_ENV;
    env.NODE_ENV = 'production'; // fuerza el chequeo (en 'test' es no-op)
    migratePlatform(); // asegura tabla platform_users en :memory:
    platformDb.delete(platformUsers).run(); // limpia estado previo
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    env.NODE_ENV = originalEnv;
    warnSpy.mockRestore();
  });

  it('con 0 superadmins → no warnea (estado antes del seed inicial)', () => {
    assertSingleSuperadmin();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('con 1 superadmin activo → no warnea (estado esperado)', () => {
    const now = Date.now();
    platformDb.insert(platformUsers).values({
      id: 'real-sa', email: 'admin@ok.com', createdAt: now, updatedAt: now,
    }).run();

    assertSingleSuperadmin();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('con 2 superadmins activos → warnea listando emails + ids (vector "test artifact")', () => {
    const now = Date.now();
    platformDb.insert(platformUsers).values([
      { id: 'real-sa', email: 'admin@ok.com', createdAt: now, updatedAt: now },
      { id: 'sa', email: 'd@d.com', createdAt: now, updatedAt: now }, // patrón del leak real
    ]).run();

    assertSingleSuperadmin();
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0];
    expect(msg).toContain('INVARIANTE ROTA');
    expect(msg).toContain('hay 2 superadmins');
    expect(msg).toContain('admin@ok.com');
    expect(msg).toContain('d@d.com');
    expect(msg).toContain('id=sa');
  });

  it('soft-deleted no cuenta: 1 activo + 1 con deletedAt → no warnea', () => {
    const now = Date.now();
    platformDb.insert(platformUsers).values([
      { id: 'real-sa', email: 'admin@ok.com', createdAt: now, updatedAt: now },
      { id: 'sa', email: 'd@d.com', createdAt: now, updatedAt: now, deletedAt: now },
    ]).run();

    assertSingleSuperadmin();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('NODE_ENV=test → no-op aunque haya 2 (los suites siembran su propio SA)', () => {
    env.NODE_ENV = 'test';
    const now = Date.now();
    platformDb.insert(platformUsers).values([
      { id: 'a', email: 'a@a.com', createdAt: now, updatedAt: now },
      { id: 'b', email: 'b@b.com', createdAt: now, updatedAt: now },
    ]).run();

    assertSingleSuperadmin();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
