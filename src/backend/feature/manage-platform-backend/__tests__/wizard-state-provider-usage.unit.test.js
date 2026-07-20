import { describe, it, expect } from 'vitest';
import { makeGetWizardState } from '../application/get-wizard-state.usecase.js';
// Post-split (P8): `findContractDependencies` vive en `infrastructure/providers/` y `get-wizard-state`
// la recibe inyectada. En tests unit la pasamos explícita — imita lo que hace bootstrap-platform.js.
import { findContractDependencies } from '../../../infrastructure/providers/find-contract-dependencies.js';

/**
 * Capa 3: `providerUsage` en el wizard state permite a la vista mostrar el impacto de deslinkear
 * ANTES del clic (chip rojo si el publicado depende, warning si sólo el draft). Se calcula
 * per-provider linkeado usando el helper compartido `findContractDependencies`.
 */
describe('get-wizard-state — providerUsage (preview de impacto para deslinkear)', () => {
  function makeDeps({ providers = [], active = null, draft = null } = {}) {
    return {
      contractRepository: {
        getActiveContract: () => active,
        getDraft: () => draft,
      },
      providerRepository: { list: () => providers },
      roleRepository: { listStaff: () => [] },
      findContractDependencies,
    };
  }

  it('sin providers linkeados → providerUsage = {} (nada que mostrar)', async () => {
    const state = await makeGetWizardState(makeDeps())();
    expect(state.providerUsage).toEqual({});
  });

  it('neon linkeado + publicado usa sql → { "database::neon": { published: [resource], draft: [], publishedVersion: "v3" } }', async () => {
    const active = { version: 'v3', schema: { resources: [{ name: 'products', store: 'sql' }] } };
    const state = await makeGetWizardState(makeDeps({
      providers: [{ category: 'database', provider: 'neon', enabled: 1 }],
      active,
    }))();
    expect(state.providerUsage['database::neon']).toEqual({
      published: [{ kind: 'resource', name: 'products', store: 'sql' }],
      draft: [],
      publishedVersion: 'v3',
    });
  });

  it('google linkeado + draft usa auth.strategies=[google] → chip warning', async () => {
    const draft = { version: 'v2', schema: { auth: { strategies: ['google'] } } };
    const state = await makeGetWizardState(makeDeps({
      providers: [{ category: 'auth', provider: 'google', enabled: 1 }],
      draft,
    }))();
    expect(state.providerUsage['auth::google']).toEqual({
      published: [],
      draft: [{ kind: 'strategy', name: 'google' }],
      publishedVersion: null,
    });
  });

  it('providers deshabilitados no aparecen en providerUsage', async () => {
    const state = await makeGetWizardState(makeDeps({
      providers: [
        { category: 'database', provider: 'neon', enabled: 0 },
        { category: 'auth', provider: 'local', enabled: 1 },
      ],
    }))();
    expect(state.providerUsage['database::neon']).toBeUndefined();
    expect(state.providerUsage['auth::local']).toBeDefined();
  });

  it('publicado + draft ambos usan el provider → ambos arrays con dependencias', async () => {
    const active = { version: 'v1', schema: { resources: [{ name: 'a', store: 'sql' }] } };
    const draft = { version: 'v2', schema: { resources: [{ name: 'a', store: 'sql' }, { name: 'b', store: 'sql' }] } };
    const state = await makeGetWizardState(makeDeps({
      providers: [{ category: 'database', provider: 'neon', enabled: 1 }],
      active,
      draft,
    }))();
    const u = state.providerUsage['database::neon'];
    expect(u.published).toHaveLength(1);
    expect(u.draft).toHaveLength(2);
    expect(u.publishedVersion).toBe('v1');
  });
});
