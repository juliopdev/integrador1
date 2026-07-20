/**
 * Pruebas unitarias del resolvedor de audiencias (access-resolver).
 * Verifica: requiredAudiences extrae audiencias por método,
 * resolveAudience resuelve API key, JWT scope y owner,
 * isAllowed evalúa permiso según audiencia presente.
 *
 * @module KernelDynamicAccessUnitTest
 */
import { describe, it, expect, vi } from 'vitest';
import { requiredAudiences, resolveAudience, isAllowed } from '../../infrastructure/no-code/access-resolver.js';
import { signAccessToken } from '../../common/jwt.js';
import { hashToken } from '../../common/token.js';

// P6b (no-code.md §9-§10): audiencias del dispatcher. Helpers puros — se testean sin Fastify.

describe('requiredAudiences', () => {
  const ep = { access: { POST: ['user'], PUT: ['editor'], GET: ['public', 'user'] } };

  it('método sin entrada en access → null (público, compatibilidad v1)', () => {
    expect(requiredAudiences(ep, 'DELETE')).toBeNull();
    expect(requiredAudiences({}, 'GET')).toBeNull();
  });

  it('entrada con "public" → null aunque liste otras audiencias', () => {
    expect(requiredAudiences(ep, 'GET')).toBeNull();
  });

  it('entrada restrictiva → audiencias exigidas', () => {
    expect(requiredAudiences(ep, 'POST')).toEqual(['user']);
    expect(requiredAudiences(ep, 'PUT')).toEqual(['editor']);
  });
});

describe('resolveAudience', () => {
  const deps = (over = {}) => ({
    findApiKeyByHash: vi.fn(() => null),
    touchApiKey: vi.fn(),
    listRoleNamesForUser: vi.fn(() => []),
    ...over,
  });

  it('sin Authorization o sin esquema Bearer → null', () => {
    expect(resolveAudience({ authorization: undefined, tenantId: 't1', deps: deps() })).toBeNull();
    expect(resolveAudience({ authorization: 'Basic xyz', tenantId: 't1', deps: deps() })).toBeNull();
  });

  it('API key mbk_ válida → audiencia user + touch best-effort', () => {
    const raw = 'mbk_test_key_value';
    const d = deps({ findApiKeyByHash: vi.fn((h) => (h === hashToken(raw) ? { id: 'k1' } : null)) });
    const audience = resolveAudience({ authorization: `Bearer ${raw}`, tenantId: 't1', deps: d });
    expect(audience).toEqual({ kind: 'user' });
    expect(d.touchApiKey).toHaveBeenCalledWith('k1');
  });

  it('API key revocada/desconocida → null (401)', () => {
    expect(resolveAudience({ authorization: 'Bearer mbk_no_existe', tenantId: 't1', deps: deps() })).toBeNull();
  });

  it('JWT scope user del MISMO tenant → audiencia user; de otro tenant → null', () => {
    const good = signAccessToken({ sub: 'u1', scope: 'user', tenantId: 't1' });
    const cross = signAccessToken({ sub: 'u1', scope: 'user', tenantId: 'OTRO' });
    expect(resolveAudience({ authorization: `Bearer ${good}`, tenantId: 't1', deps: deps() })).toEqual({ kind: 'user', userId: 'u1' });
    expect(resolveAudience({ authorization: `Bearer ${cross}`, tenantId: 't1', deps: deps() })).toBeNull();
  });

  it('JWT scope tenant (Staff) → audiencia staff con sus roles de user_roles', () => {
    const token = signAccessToken({ sub: 'staff1', scope: 'tenant', tenantId: 't1' });
    const d = deps({ listRoleNamesForUser: vi.fn(() => ['editor']) });
    expect(resolveAudience({ authorization: `Bearer ${token}`, tenantId: 't1', deps: d })).toEqual({ kind: 'staff', userId: 'staff1', roles: ['editor'] });
    expect(d.listRoleNamesForUser).toHaveBeenCalledWith('staff1');
  });

  it('JWT malformado o de scope platform → null', () => {
    expect(resolveAudience({ authorization: 'Bearer no-es-jwt', tenantId: 't1', deps: deps() })).toBeNull();
    const platform = signAccessToken({ sub: 'sa', scope: 'platform' });
    expect(resolveAudience({ authorization: `Bearer ${platform}`, tenantId: 't1', deps: deps() })).toBeNull();
  });
});

describe('isAllowed', () => {
  it('audiencia user solo pasa si `user` está exigida', () => {
    expect(isAllowed(['user'], { kind: 'user', userId: 'u1' })).toBe(true);
    expect(isAllowed(['editor'], { kind: 'user', userId: 'u1' })).toBe(false);
  });

  it('si `owner` está en required, cualquier llamador autenticado pasa preliminarmente', () => {
    expect(isAllowed(['owner'], { kind: 'user', userId: 'u1' })).toBe(true);
    expect(isAllowed(['owner'], { kind: 'staff', userId: 'staff1', roles: ['editor'] })).toBe(true);
  });

  it('staff pasa por intersección de roles; master siempre (acceso total §10)', () => {
    expect(isAllowed(['editor'], { kind: 'staff', userId: 's1', roles: ['editor', 'viewer'] })).toBe(true);
    expect(isAllowed(['editor'], { kind: 'staff', userId: 's1', roles: ['viewer'] })).toBe(false);
    expect(isAllowed(['editor'], { kind: 'staff', userId: 's1', roles: ['master'] })).toBe(true);
  });

  it('sin audiencia → false', () => {
    expect(isAllowed(['user'], null)).toBe(false);
  });
});
