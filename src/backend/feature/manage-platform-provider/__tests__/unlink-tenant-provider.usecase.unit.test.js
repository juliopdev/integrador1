import { describe, it, expect, vi } from 'vitest';
import { makeUnlinkTenantProvider } from '../application/unlink-tenant-provider.usecase.js';

/**
 * Guardas anti-footgun al deslinkear un provider:
 *  - Contrato publicado depende → hard block (sin `force`).
 *  - Draft en curso depende → soft block (requiere `force: true`).
 *  - Nadie depende → deshabilita sin drama.
 */
describe('unlink-tenant-provider — guardas de dependencia (Capas 1 + 2)', () => {
  const now = () => 1000;

  function makeDeps({ activeContract = null, draft = null } = {}) {
    const providerRepository = { disable: vi.fn() };
    const contractRepository = {
      getActiveContract: () => activeContract,
      getDraft: () => draft,
    };
    return { providerRepository, contractRepository };
  }

  it('sin contrato publicado ni draft → deshabilita el provider (happy path)', async () => {
    const deps = makeDeps();
    const unlink = makeUnlinkTenantProvider({ ...deps, now });
    const result = await unlink({ category: 'database', provider: 'neon' });
    expect(result).toEqual({ category: 'database', provider: 'neon', unlinked: true });
    expect(deps.providerRepository.disable).toHaveBeenCalledWith({ category: 'database', provider: 'neon', now: 1000 });
  });

  // ── Capa 1: hard block por contrato publicado ────────────────────────
  it('publicado usa neon (resource store=sql) → PROVIDER_IN_USE_BY_PUBLISHED (hard, sin force)', async () => {
    const activeContract = {
      version: 'v3',
      schema: { resources: [{ name: 'products', store: 'sql' }, { name: 'orders', store: 'sql' }] },
    };
    const deps = makeDeps({ activeContract });
    const unlink = makeUnlinkTenantProvider({ ...deps, now });

    await expect(unlink({ category: 'database', provider: 'neon' })).rejects.toMatchObject({
      code: 'PROVIDER_IN_USE_BY_PUBLISHED',
      statusCode: 422,
      details: {
        version: 'v3',
        dependencies: [
          { kind: 'resource', name: 'products', store: 'sql' },
          { kind: 'resource', name: 'orders', store: 'sql' },
        ],
      },
    });
    expect(deps.providerRepository.disable).not.toHaveBeenCalled();
  });

  it('publicado tiene auth.strategies=[google] → deslinkear auth/google es hard block', async () => {
    const activeContract = {
      version: 'v1',
      schema: { resources: [], auth: { strategies: ['local', 'google'] } },
    };
    const deps = makeDeps({ activeContract });
    const unlink = makeUnlinkTenantProvider({ ...deps, now });

    await expect(unlink({ category: 'auth', provider: 'google' })).rejects.toMatchObject({
      code: 'PROVIDER_IN_USE_BY_PUBLISHED',
      details: { dependencies: [{ kind: 'strategy', name: 'google' }] },
    });
  });

  it('publicado NO usa el provider (otro store) → deslinkear procede', async () => {
    const activeContract = {
      version: 'v2',
      schema: { resources: [{ name: 'events', store: 'nosql' }] },
    };
    const deps = makeDeps({ activeContract });
    const unlink = makeUnlinkTenantProvider({ ...deps, now });
    const result = await unlink({ category: 'database', provider: 'neon' });
    expect(result).toEqual({ category: 'database', provider: 'neon', unlinked: true });
    expect(deps.providerRepository.disable).toHaveBeenCalled();
  });

  it('`force: true` NO puede saltar la guarda de contrato publicado (no hay override)', async () => {
    const activeContract = {
      version: 'v1',
      schema: { resources: [{ name: 'products', store: 'sql' }] },
    };
    const deps = makeDeps({ activeContract });
    const unlink = makeUnlinkTenantProvider({ ...deps, now });
    await expect(unlink({ category: 'database', provider: 'neon', force: true })).rejects.toMatchObject({
      code: 'PROVIDER_IN_USE_BY_PUBLISHED',
    });
  });

  // ── Capa 2: soft block por draft con force para saltar ───────────────
  it('draft usa neon, sin force → PROVIDER_IN_USE_BY_DRAFT + dependencies', async () => {
    const draft = {
      version: 'v2',
      schema: { resources: [{ name: 'sessions', store: 'sql' }] },
    };
    const deps = makeDeps({ draft });
    const unlink = makeUnlinkTenantProvider({ ...deps, now });
    await expect(unlink({ category: 'database', provider: 'neon' })).rejects.toMatchObject({
      code: 'PROVIDER_IN_USE_BY_DRAFT',
      statusCode: 422,
      details: { dependencies: [{ kind: 'resource', name: 'sessions', store: 'sql' }] },
    });
    expect(deps.providerRepository.disable).not.toHaveBeenCalled();
  });

  it('draft usa neon, force=true → deshabilita (elementos quedan huérfanos)', async () => {
    const draft = {
      version: 'v2',
      schema: { resources: [{ name: 'sessions', store: 'sql' }] },
    };
    const deps = makeDeps({ draft });
    const unlink = makeUnlinkTenantProvider({ ...deps, now });
    const result = await unlink({ category: 'database', provider: 'neon', force: true });
    expect(result).toEqual({ category: 'database', provider: 'neon', unlinked: true });
    expect(deps.providerRepository.disable).toHaveBeenCalled();
  });

  // ── Combinaciones ────────────────────────────────────────────────────
  it('publicado depende Y draft depende → gana publicado (hard block) aún con force', async () => {
    const activeContract = { version: 'v1', schema: { resources: [{ name: 'x', store: 'sql' }] } };
    const draft = { version: 'v2', schema: { resources: [{ name: 'y', store: 'sql' }] } };
    const deps = makeDeps({ activeContract, draft });
    const unlink = makeUnlinkTenantProvider({ ...deps, now });
    await expect(unlink({ category: 'database', provider: 'neon', force: true })).rejects.toMatchObject({
      code: 'PROVIDER_IN_USE_BY_PUBLISHED',
    });
  });

  it('provider desconocido (storage/cloudinary) no detecta deps hoy → deshabilita', async () => {
    const activeContract = { version: 'v1', schema: { resources: [] } };
    const deps = makeDeps({ activeContract });
    const unlink = makeUnlinkTenantProvider({ ...deps, now });
    const result = await unlink({ category: 'storage', provider: 'cloudinary' });
    expect(result).toEqual({ category: 'storage', provider: 'cloudinary', unlinked: true });
  });

  it('sin contractRepository (composición unit acotada) → salta guardas y deshabilita', async () => {
    const providerRepository = { disable: vi.fn() };
    const unlink = makeUnlinkTenantProvider({ providerRepository, now });
    const result = await unlink({ category: 'database', provider: 'neon' });
    expect(result.unlinked).toBe(true);
    expect(providerRepository.disable).toHaveBeenCalled();
  });
});
