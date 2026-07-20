import { describe, it, expect, vi } from 'vitest';
import { makeRegisterUser } from '../application/register.usecase.js';
import { DomainError } from '../../../common/errors.js';

function makeDeps({ existingUser = null, existingRole = { id: 'r-user' } } = {}) {
  const userRepository = {
    findByEmail: vi.fn(() => existingUser),
    findUserRoleByName: vi.fn(() => existingRole),
    createUserRole: vi.fn(() => ({ id: 'r-user' })),
    insertUser: vi.fn(),
    assignRole: vi.fn(),
  };
  const hasher = { hash: vi.fn(async (v) => `H(${v})`) };
  return { userRepository, hasher };
}

describe('register.usecase — auto-registro de end-users', () => {
  it('email + password válidos → crea user local, asigna rol `user`, devuelve userId', async () => {
    const deps = makeDeps();
    const usecase = makeRegisterUser(deps);
    const result = await usecase({ email: 'ana@shop.com', password: 'MyPass1234' });

    expect(deps.userRepository.findByEmail).toHaveBeenCalledWith('ana@shop.com');
    expect(deps.hasher.hash).toHaveBeenCalledWith('MyPass1234');
    // insertUser recibe passwordHash pero NO passphraseHash (end-user ≠ admin).
    expect(deps.userRepository.insertUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@shop.com',
      passwordHash: 'H(MyPass1234)',
      authProvider: 'local',
      status: 'active',
    }));
    const insertCall = deps.userRepository.insertUser.mock.calls[0][0];
    expect(insertCall).not.toHaveProperty('passphraseHash');
    expect(deps.userRepository.assignRole).toHaveBeenCalledWith(expect.objectContaining({ userId: insertCall.id, roleId: 'r-user' }));
    expect(result).toEqual({ userId: insertCall.id, email: 'ana@shop.com' });
  });

  it('email duplicado → DomainError EMAIL_TAKEN sin escritura', async () => {
    const deps = makeDeps({ existingUser: { id: 'u1', email: 'ana@shop.com' } });
    const usecase = makeRegisterUser(deps);
    await expect(usecase({ email: 'ana@shop.com', password: 'MyPass1234' }))
      .rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    await expect(usecase({ email: 'ana@shop.com', password: 'MyPass1234' }))
      .rejects.toBeInstanceOf(DomainError);
    expect(deps.userRepository.insertUser).not.toHaveBeenCalled();
  });

  it('rol `user` no existe → lo auto-provisiona antes de asignar', async () => {
    const deps = makeDeps({ existingRole: null });
    deps.userRepository.createUserRole = vi.fn(() => ({ id: 'r-user-new' }));
    const usecase = makeRegisterUser(deps);
    await usecase({ email: 'x@y.com', password: 'MyPass1234' });
    expect(deps.userRepository.createUserRole).toHaveBeenCalled();
    expect(deps.userRepository.assignRole).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'r-user-new' }));
  });

  it('normaliza email a lowercase', async () => {
    const deps = makeDeps();
    const usecase = makeRegisterUser(deps);
    await usecase({ email: 'Ana@Shop.COM', password: 'MyPass1234' });
    expect(deps.userRepository.findByEmail).toHaveBeenCalledWith('ana@shop.com');
    expect(deps.userRepository.insertUser.mock.calls[0][0].email).toBe('ana@shop.com');
  });

  it('llama al callback onRegisterSuccess tras crear el usuario local con éxito', async () => {
    const deps = makeDeps();
    const onRegisterSuccess = vi.fn();
    const usecase = makeRegisterUser({ ...deps, onRegisterSuccess });
    const result = await usecase({ email: 'ana@shop.com', password: 'MyPass1234' });
    expect(onRegisterSuccess).toHaveBeenCalledWith(expect.objectContaining({
      userId: result.userId,
      email: 'ana@shop.com',
      passwordHash: 'H(MyPass1234)',
    }));
  });
});
