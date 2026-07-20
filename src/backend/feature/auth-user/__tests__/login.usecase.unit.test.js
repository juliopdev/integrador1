import { describe, it, expect, vi } from 'vitest';
import { makeLoginUser } from '../application/login.usecase.js';

// Los tests aquí sólo cubren INVARIANTES INTERNAS del use case que no son observables via HTTP:
// normalización de email, ausencia de timing leak (no `verify` en paths sin hash), rechazo de
// login local con cuenta OAuth. Los happy paths y errores 401 (INVALID_CREDENTIALS,
// FORBIDDEN_ADMIN_LOGIN) los cubre `auth-user.functional.test.js` end-to-end.

function makeDeps({ user = null, passwordOk = true } = {}) {
  const userRepository = { findByEmail: vi.fn(() => user) };
  const verifier = { verify: vi.fn(async () => passwordOk) };
  return { userRepository, verifier };
}

describe('login.usecase — invariantes internas (login local de end-user, sin passphrase)', () => {
  const activeUser = {
    id: 'u1', email: 'ana@shop.com',
    passwordHash: 'H(pw)',
    passphraseHash: null,
    status: 'active',
    authProvider: 'local',
  };

  it('credenciales correctas → devuelve { userId, email } y verifica hash con el input', async () => {
    const deps = makeDeps({ user: activeUser });
    const result = await makeLoginUser(deps)({ email: 'ana@shop.com', password: 'pw' });
    expect(result).toEqual({ userId: 'u1', email: 'ana@shop.com' });
    expect(deps.verifier.verify).toHaveBeenCalledWith('pw', 'H(pw)');
  });

  it('normaliza email a lowercase antes del lookup', async () => {
    const deps = makeDeps({ user: activeUser });
    await makeLoginUser(deps)({ email: 'ANA@Shop.COM', password: 'pw' });
    expect(deps.userRepository.findByEmail).toHaveBeenCalledWith('ana@shop.com');
  });

  it('email desconocido → INVALID_CREDENTIALS SIN verificar hash (anti timing-leak)', async () => {
    const deps = makeDeps({ user: null });
    await expect(makeLoginUser(deps)({ email: 'x@y.com', password: 'pw' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(deps.verifier.verify).not.toHaveBeenCalled();
  });

  it('user suspendido → ACCOUNT_SUSPENDED SIN verificar hash', async () => {
    const deps = makeDeps({ user: { ...activeUser, status: 'suspended' } });
    await expect(makeLoginUser(deps)({ email: 'ana@shop.com', password: 'pw' }))
      .rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(deps.verifier.verify).not.toHaveBeenCalled();
  });

  it('user OAuth (sin passwordHash) no puede login local → INVALID_CREDENTIALS (previene downgrade)', async () => {
    const deps = makeDeps({ user: { ...activeUser, passwordHash: null, authProvider: 'google' } });
    await expect(makeLoginUser(deps)({ email: 'ana@shop.com', password: 'pw' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});
