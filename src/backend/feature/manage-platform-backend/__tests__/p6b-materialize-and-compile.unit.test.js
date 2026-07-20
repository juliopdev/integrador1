import { describe, it, expect, vi } from 'vitest';
import { materializeDerivedAuth } from '../../../infrastructure/providers/materialize-derived-auth.js';
import { makeCompileAccessToRoles } from '../../manage-platform-role/application/compile-access-to-roles.usecase.js';

// P6b: materialización de la auth derivada + compilación access → roles (no-code.md §7/§10).

describe('materializeDerivedAuth', () => {
  const base = { version: 'v1', auth: { userAuthEnabled: false, strategies: [], redirectUris: [] } };

  it('sin providers de auth linkeados → contrato tiene stores mapeados y auth intacta (compat v1)', () => {
    const out = materializeDerivedAuth({
      contract: base,
      linkedProviders: [{ category: 'database', provider: 'neon', enabled: 1 }],
      subdomain: 'tienda',
      appUrl: 'http://localhost:3000',
    });
    expect(out.stores).toEqual({ sql: { provider: 'neon', enabled: true } });
    expect(out.auth).toEqual(base.auth);
  });

  it('local + google linkeados → habilitada con redirects POR CONVENCIÓN desde APP_URL', () => {
    const out = materializeDerivedAuth({
      contract: { ...base, stores: { sql: { provider: 'neon', enabled: true } } },
      linkedProviders: [
        { category: 'auth', provider: 'local', enabled: 1 },
        { category: 'auth', provider: 'google', enabled: 1 },
        { category: 'auth', provider: 'facebook', enabled: 0 }, // deslinkeado: no cuenta
      ],
      subdomain: 'tienda',
      appUrl: 'http://localhost:3000',
    });
    expect(out.auth.userAuthEnabled).toBe(true);
    expect(out.auth.strategies).toEqual(['local', 'google']);
    // Protocolo/host desde APP_URL (no fabrica https en dev).
    expect(out.auth.redirectUris).toEqual([
      'http://tienda.localhost:3000/',
      'http://tienda.localhost:3000/auth/callback',
    ]);
    expect(out.version).toBe('v1'); // el resto del contrato no se toca
    
    // Debería auto-inyectar el recurso `users` si no existe
    const usersRes = out.resources.find((r) => r.name === 'users');
    expect(usersRes).toBeDefined();
    expect(usersRes.physicalName).toBe('users_db');
    expect(usersRes.fields).toContainEqual({ id: 'f_user_email', name: 'email', type: 'string', required: true, unique: true });
    expect(usersRes.fields).toContainEqual({ id: 'f_user_password_hash', name: 'password_hash', type: 'string', required: false });
  });
});

describe('compileAccessToRoles', () => {
  const makeRepo = (rolesByName = {}) => ({
    findByName: vi.fn((name) => rolesByName[name] ?? null),
    updatePermissions: vi.fn(),
  });

  it('compila la matriz método×rol a permissions_json por versión (public/user no tocan roles)', () => {
    const repo = makeRepo({ editor: { id: 'r1', permissionsJson: '{}' } });
    const uc = makeCompileAccessToRoles({ roleRepository: repo, now: () => 99 });
    const result = uc({
      contract: {
        version: 'v2',
        endpoints: [
          { path: '/products', resource: 'products', methods: ['GET', 'POST', 'PUT'], access: { GET: ['public'], POST: ['user'], PUT: ['editor'] } },
          { path: '/orders', resource: 'orders', methods: ['GET'], access: { GET: ['editor', 'user'] } },
        ],
      },
    });
    expect(result.rolesUpdated).toEqual(['editor']);
    const call = repo.updatePermissions.mock.calls[0][0];
    expect(call.id).toBe('r1');
    expect(JSON.parse(call.permissionsJson)).toEqual({ v2: { products: ['PUT'], orders: ['GET'] } });
  });

  it('preserva los permisos de otras versiones al re-publicar', () => {
    const repo = makeRepo({ editor: { id: 'r1', permissionsJson: JSON.stringify({ v1: { legacy: ['GET'] } }) } });
    const uc = makeCompileAccessToRoles({ roleRepository: repo });
    uc({ contract: { version: 'v2', endpoints: [{ path: '/p', resource: 'p', methods: ['GET'], access: { GET: ['editor'] } }] } });
    const perms = JSON.parse(repo.updatePermissions.mock.calls[0][0].permissionsJson);
    expect(perms.v1).toEqual({ legacy: ['GET'] });
    expect(perms.v2).toEqual({ p: ['GET'] });
  });

  it('roles inexistentes se ignoran (defensivo) y sin access no escribe nada', () => {
    const repo = makeRepo();
    const uc = makeCompileAccessToRoles({ roleRepository: repo });
    const r1 = uc({ contract: { version: 'v1', endpoints: [{ path: '/p', resource: 'p', methods: ['GET'], access: { GET: ['fantasma'] } }] } });
    expect(r1.rolesUpdated).toEqual([]);
    const r2 = uc({ contract: { version: 'v1', endpoints: [{ path: '/p', resource: 'p', methods: ['GET'] }] } });
    expect(r2.rolesUpdated).toEqual([]);
    expect(repo.updatePermissions).not.toHaveBeenCalled();
  });
});
