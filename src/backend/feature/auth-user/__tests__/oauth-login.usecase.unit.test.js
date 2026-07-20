import { describe, it, expect, vi } from 'vitest';
import { makeOAuthLogin } from '../application/oauth-login.usecase.js';
import { AuthError } from '../../../common/errors.js';

function makeDeps({ existingUser = null, existingByEmail = null, existingRole = { id: 'r-user' } } = {}) {
  const userRepository = {
    findByProvider: vi.fn(() => existingUser),
    findByEmail: vi.fn(() => existingByEmail),
    findUserRoleByName: vi.fn(() => existingRole),
    createUserRole: vi.fn(() => ({ id: 'r-user-new' })),
    insertOAuthUser: vi.fn(),
    assignRole: vi.fn(),
  };
  return { userRepository };
}

describe('oauth-login.usecase — upsert por (authProvider, sub)', () => {
  const profile = { sub: 'g-1234567890', email: 'ana@example.com', name: 'Ana' };

  it('primer login (sub no existe, email libre) → crea user OAuth + asigna rol `user`', async () => {
    const deps = makeDeps();
    const result = await makeOAuthLogin(deps)({ authProvider: 'google', profile });

    expect(deps.userRepository.findByProvider).toHaveBeenCalledWith({ authProvider: 'google', providerUserId: 'g-1234567890' });
    expect(deps.userRepository.findByEmail).toHaveBeenCalledWith('ana@example.com');
    const insertCall = deps.userRepository.insertOAuthUser.mock.calls[0][0];
    expect(insertCall).toMatchObject({
      email: 'ana@example.com',
      authProvider: 'google',
      providerUserId: 'g-1234567890',
      status: 'active',
    });
    expect(insertCall).not.toHaveProperty('passwordHash');
    expect(deps.userRepository.assignRole).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'r-user' }));
    expect(result).toEqual({ userId: insertCall.id, email: 'ana@example.com' });
  });

  it('login recurrente (sub ya existe) → reusa el user, sin insertar', async () => {
    const existing = { id: 'u1', email: 'ana@example.com', authProvider: 'google', providerUserId: 'g-1234567890', status: 'active' };
    const deps = makeDeps({ existingUser: existing });
    const result = await makeOAuthLogin(deps)({ authProvider: 'google', profile });

    expect(deps.userRepository.insertOAuthUser).not.toHaveBeenCalled();
    expect(deps.userRepository.assignRole).not.toHaveBeenCalled();
    expect(result).toEqual({ userId: 'u1', email: 'ana@example.com' });
  });

  it('user existente pero suspendido → AuthError ACCOUNT_SUSPENDED', async () => {
    const existing = { id: 'u1', email: 'ana@example.com', authProvider: 'google', providerUserId: 'g-1234567890', status: 'suspended' };
    const deps = makeDeps({ existingUser: existing });
    await expect(makeOAuthLogin(deps)({ authProvider: 'google', profile }))
      .rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });

  it('email colisiona con un user local existente (mismo email, otro authProvider) → AuthError EMAIL_TAKEN_BY_LOCAL', async () => {
    // Un user local (password) ya existe con ese email. No auto-linkeamos por email — pedimos
    // reset explícito. Motivo: security.md — prevenir account takeover si un atacante crea
    // OAuth con el mismo email que un user local.
    const localUser = { id: 'u-local', email: 'ana@example.com', authProvider: 'local', passwordHash: 'H' };
    const deps = makeDeps({ existingUser: null, existingByEmail: localUser });
    await expect(makeOAuthLogin(deps)({ authProvider: 'google', profile }))
      .rejects.toMatchObject({ code: 'EMAIL_TAKEN_BY_LOCAL' });
    expect(deps.userRepository.insertOAuthUser).not.toHaveBeenCalled();
  });

  it('normaliza email a lowercase', async () => {
    const deps = makeDeps();
    await makeOAuthLogin(deps)({ authProvider: 'google', profile: { ...profile, email: 'ANA@Example.COM' } });
    expect(deps.userRepository.findByEmail).toHaveBeenCalledWith('ana@example.com');
    expect(deps.userRepository.insertOAuthUser.mock.calls[0][0].email).toBe('ana@example.com');
  });

  it('sin `sub` en el profile → AuthError INVALID_PROFILE', async () => {
    const deps = makeDeps();
    await expect(makeOAuthLogin(deps)({ authProvider: 'google', profile: { email: 'ana@example.com' } }))
      .rejects.toBeInstanceOf(AuthError);
  });

  it('auto-provisiona el rol `user` si aún no existe (mismo patrón que register local)', async () => {
    const deps = makeDeps({ existingRole: null });
    await makeOAuthLogin(deps)({ authProvider: 'google', profile });
    expect(deps.userRepository.createUserRole).toHaveBeenCalled();
    expect(deps.userRepository.assignRole).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'r-user-new' }));
  });

  it('callback onLoginSuccess dispara SIEMPRE — tanto en primer registro como en login recurrente', async () => {
    // Primer login: user recién creado.
    const depsNew = makeDeps();
    const onLoginSuccessNew = vi.fn();
    const resultNew = await makeOAuthLogin({ ...depsNew, onLoginSuccess: onLoginSuccessNew })({ authProvider: 'google', profile });
    expect(onLoginSuccessNew).toHaveBeenCalledWith(expect.objectContaining({
      userId: resultNew.userId, email: 'ana@example.com', name: 'Ana',
    }));

    // Login recurrente: user ya existe con el mismo `sub`.
    const existing = { id: 'u1', email: 'ana@example.com', authProvider: 'google', providerUserId: 'g-1234567890', status: 'active' };
    const depsRec = makeDeps({ existingUser: existing });
    const onLoginSuccessRec = vi.fn();
    await makeOAuthLogin({ ...depsRec, onLoginSuccess: onLoginSuccessRec })({ authProvider: 'google', profile });
    expect(onLoginSuccessRec).toHaveBeenCalledWith({
      userId: 'u1', email: 'ana@example.com', name: 'Ana',
    });
  });
});
