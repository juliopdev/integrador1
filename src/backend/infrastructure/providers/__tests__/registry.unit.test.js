import { describe, it, expect } from 'vitest';
import {
  PROVIDER_REGISTRY,
  PROVIDER_CATEGORIES,
  findProvider,
  testProviderConnection,
  findContractDependenciesFromRegistry,
  materializeContractFromProviders,
} from '../registry.js';

/**
 * P8.5: el registry es la fuente única de verdad. Este suite verifica el CONTRACT de cada entrada
 * y el comportamiento de los helpers derivados. Cada regresión que quiebre estos invariants es un
 * boom en 5+ archivos consumidores — vale la pena verificarlos acá.
 */
describe('PROVIDER_REGISTRY — contract shape', () => {
  it('cada entrada tiene los campos requeridos con los tipos correctos', () => {
    for (const desc of PROVIDER_REGISTRY) {
      expect(typeof desc.category).toBe('string');
      expect(typeof desc.provider).toBe('string');
      expect(typeof desc.label).toBe('string');
      expect(typeof desc.operable).toBe('boolean');
      expect(Array.isArray(desc.fields)).toBe(true);
      expect(typeof desc.testConnection).toBe('function');
      expect(typeof desc.findDependencies).toBe('function');
      expect(typeof desc.materializeContract).toBe('function');
    }
  });

  it('claves (category, provider) son únicas', () => {
    const keys = PROVIDER_REGISTRY.map((p) => `${p.category}::${p.provider}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('providers de database operables declaran storeType', () => {
    for (const desc of PROVIDER_REGISTRY.filter((p) => p.category === 'database' && p.operable)) {
      expect(['sql', 'nosql']).toContain(desc.storeType);
    }
  });

  it('providers NO operables devuelven false en testConnection', async () => {
    for (const desc of PROVIDER_REGISTRY.filter((p) => !p.operable)) {
      expect(await desc.testConnection({ config: {} })).toBe(false);
    }
  });
});

describe('PROVIDER_CATEGORIES — derivadas del registry', () => {
  it('incluye database + auth + storage', () => {
    expect(PROVIDER_CATEGORIES).toEqual(expect.arrayContaining(['database', 'auth', 'storage']));
  });
});

describe('findProvider', () => {
  it('devuelve el descriptor cuando existe', () => {
    const desc = findProvider({ category: 'database', provider: 'neon' });
    expect(desc?.label).toBe('Neon (Postgres SQL)');
  });

  it('devuelve undefined cuando no existe', () => {
    expect(findProvider({ category: 'auth', provider: 'no-existe' })).toBeUndefined();
    expect(findProvider({ category: 'aws', provider: 's3' })).toBeUndefined();
  });
});

describe('testProviderConnection', () => {
  it('provider desconocido → false', async () => {
    expect(await testProviderConnection({ category: 'auth', provider: 'nada', config: {} })).toBe(false);
  });

  it('provider no operable → false aunque el config sea válido', async () => {
    expect(await testProviderConnection({ category: 'auth', provider: 'facebook', config: { anything: true } })).toBe(false);
  });

  it('auth/local operable → true sin config', async () => {
    expect(await testProviderConnection({ category: 'auth', provider: 'local', config: {} })).toBe(true);
  });

  it('auth/google con clientId inválido → false', async () => {
    expect(await testProviderConnection({
      category: 'auth', provider: 'google',
      config: { clientId: 'no-parece-google', clientSecret: 'x' },
    })).toBe(false);
  });

  it('auth/google con clientId válido → true (sólo valida shape)', async () => {
    expect(await testProviderConnection({
      category: 'auth', provider: 'google',
      config: { clientId: 'x.apps.googleusercontent.com', clientSecret: 'GOCSPX-abc' },
    })).toBe(true);
  });
});

describe('findContractDependenciesFromRegistry', () => {
  it('database/neon detecta resources con store=sql', () => {
    const schema = { resources: [{ name: 'products', store: 'sql' }, { name: 'events', store: 'nosql' }] };
    const deps = findContractDependenciesFromRegistry(schema, 'database', 'neon');
    expect(deps).toEqual([{ kind: 'resource', name: 'products', store: 'sql' }]);
  });

  it('auth/google detecta strategy en auth.strategies', () => {
    const schema = { auth: { strategies: ['local', 'google'] } };
    const deps = findContractDependenciesFromRegistry(schema, 'auth', 'google');
    expect(deps).toEqual([{ kind: 'strategy', name: 'google' }]);
  });

  it('storage/cloudinary NO tiene dependencias en el schema (assets se resuelven runtime)', () => {
    const schema = { resources: [{ name: 'x', fields: [{ name: 'photo', type: 'asset' }] }] };
    expect(findContractDependenciesFromRegistry(schema, 'storage', 'cloudinary')).toEqual([]);
  });

  it('sin schema → []', () => {
    expect(findContractDependenciesFromRegistry(null, 'database', 'neon')).toEqual([]);
  });
});

describe('materializeContractFromProviders', () => {
  const ctx = { subdomain: 'tienda', appUrl: 'http://localhost:3000' };
  const baseContract = { version: 'v1', stores: {}, resources: [], auth: { userAuthEnabled: false, strategies: [], redirectUris: [] } };

  it('sin providers linkeados → contrato intacto', () => {
    const result = materializeContractFromProviders(baseContract, { linkedProviders: [], ...ctx });
    expect(result).toEqual(baseContract);
  });

  it('neon linkeado → stores.sql = { provider: neon, enabled: true }', () => {
    const linked = [{ category: 'database', provider: 'neon', enabled: 1 }];
    const result = materializeContractFromProviders(baseContract, { linkedProviders: linked, ...ctx });
    expect(result.stores.sql).toEqual({ provider: 'neon', enabled: true });
  });

  it('auth/local linkeado → auth.strategies=[local] + redirect /', () => {
    const linked = [{ category: 'auth', provider: 'local', enabled: 1 }];
    const result = materializeContractFromProviders(baseContract, { linkedProviders: linked, ...ctx });
    expect(result.auth.userAuthEnabled).toBe(true);
    expect(result.auth.strategies).toEqual(['local']);
    expect(result.auth.redirectUris).toEqual(['http://tienda.localhost:3000/']);
  });

  it('local + google linkeados → strategies dedupeadas + redirects únicos', () => {
    const linked = [
      { category: 'auth', provider: 'local', enabled: 1 },
      { category: 'auth', provider: 'google', enabled: 1 },
    ];
    const result = materializeContractFromProviders(baseContract, { linkedProviders: linked, ...ctx });
    expect(result.auth.strategies).toEqual(['local', 'google']);
    expect(result.auth.redirectUris).toEqual([
      'http://tienda.localhost:3000/',
      'http://tienda.localhost:3000/auth/callback',
    ]);
  });

  it('providers con enabled=0 se ignoran', () => {
    const linked = [{ category: 'auth', provider: 'local', enabled: 0 }];
    const result = materializeContractFromProviders(baseContract, { linkedProviders: linked, ...ctx });
    expect(result.auth.strategies).toEqual([]);
  });
});
