import { describe, it, expect } from 'vitest';
import { validateContract } from '../domain/contract.schema.js';

const validContract = () => ({
  version: 'v1',
  stores: {
    sql: { provider: 'neon', enabled: true },
    nosql: { provider: 'mongodb-atlas', enabled: false },
    assets: { provider: 'cloudinary', enabled: true },
  },
  resources: [
    {
      name: 'products',
      store: 'sql',
      physicalName: 'products_db',
      fields: [
        { id: 'f_1', name: 'title', type: 'string', required: true },
        { id: 'f_2', name: 'photo', type: 'asset', provider: 'cloudinary' },
      ],
    },
  ],
  endpoints: [{ path: '/products', resource: 'products', methods: ['GET', 'POST'] }],
  auth: { userAuthEnabled: false },
});

describe('validateContract', () => {
  it('acepta un contrato válido y aplica defaults', () => {
    const c = validateContract(validContract());
    expect(c.resources[0].fields[0].required).toBe(true);
    expect(c.auth.strategies).toEqual([]); // default
  });

  it('rechaza un endpoint con palabra reservada', () => {
    const bad = validContract();
    bad.endpoints = [{ path: '/auth', resource: 'products', methods: ['GET'] }];
    expect(() => validateContract(bad)).toThrow(/reservada/);
  });

  it('rechaza un endpoint que referencia un resource inexistente', () => {
    const bad = validContract();
    bad.endpoints = [{ path: '/orders', resource: 'orders', methods: ['GET'] }];
    expect(() => validateContract(bad)).toThrow(/inexistente/);
  });

  it('rechaza un resource sobre un store deshabilitado', () => {
    const bad = validContract();
    bad.resources[0].store = 'nosql'; // nosql.enabled = false
    expect(() => validateContract(bad)).toThrow(/no está habilitado/);
  });

  it('rechaza un campo asset sin provider', () => {
    const bad = validContract();
    bad.resources[0].fields[1] = { id: 'f_2', name: 'photo', type: 'asset' };
    expect(() => validateContract(bad)).toThrow(/asset/);
  });

  it('rechaza un tipo de campo no permitido (lanza DomainError INVALID_CONTRACT)', () => {
    const bad = validContract();
    bad.resources[0].fields[0].type = 'uuid';
    try {
      validateContract(bad);
      expect.unreachable();
    } catch (err) {
      expect(err.code).toBe('INVALID_CONTRACT');
      expect(err.statusCode).toBe(422);
    }
  });

  // Iter 2026-07: bug real del contrato de "Mi Tienda Online" — se declaraba `access: ['owner']`
  // en /order_items sin que el resource tuviera un field owner. El dispatcher devolvía 403
  // permanente. Ahora publish-contract rechaza antes de guardar.
  it('rechaza endpoint con access "owner" cuyo resource NO tiene field de dueño', () => {
    const bad = validContract();
    // products no tiene user_id/userId/created_by/user → owner es imposible.
    bad.endpoints = [{
      path: '/products',
      resource: 'products',
      methods: ['GET', 'POST'],
      access: { GET: ['owner'], POST: ['owner'] },
    }];
    expect(() => validateContract(bad)).toThrow(/no tiene ning[uú]n field de due[nñ]o/);
  });

  it('acepta endpoint con access "owner" cuando el resource tiene un field owner válido', () => {
    const c = validContract();
    c.resources.push({
      name: 'orders',
      store: 'sql',
      physicalName: 'orders_db',
      fields: [
        { id: 'f_o1', name: 'user_id', type: 'string', required: true },
        { id: 'f_o2', name: 'total', type: 'float' },
      ],
    });
    c.endpoints.push({
      path: '/orders',
      resource: 'orders',
      methods: ['GET', 'POST'],
      access: { GET: ['owner'], POST: ['owner'] },
    });
    expect(() => validateContract(c)).not.toThrow();
  });

  it('reconoce nombres alternativos de owner field (created_by además de user_id)', () => {
    const c = validContract();
    c.resources.push({
      name: 'posts',
      store: 'sql',
      physicalName: 'posts_db',
      fields: [
        // El schema exige field names en snake_case (regex IDENT); `created_by` está en OWNER_FIELD_NAMES.
        { id: 'f_p1', name: 'created_by', type: 'string' },
      ],
    });
    c.endpoints.push({
      path: '/posts',
      resource: 'posts',
      methods: ['POST'],
      access: { POST: ['owner'] },
    });
    expect(() => validateContract(c)).not.toThrow();
  });
});
