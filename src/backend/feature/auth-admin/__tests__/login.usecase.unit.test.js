import { describe, it, expect, vi } from 'vitest';
import { makeLogin } from '../application/login.usecase.js';

const USER = { id: 'u1', email: 'a@b.com', passwordHash: 'ph', passphraseHash: 'pph' };

function build({ found = USER, verify, isActive = () => true } = {}) {
  const adminRepository = { findByEmail: vi.fn(async () => found) };
  return { login: makeLogin({ adminRepository, verifier: { verify }, scope: 'platform', isActive }), verify };
}

describe('login (auth-admin)', () => {
  it('éxito con password + passphrase correctas', async () => {
    const { login } = build({ verify: vi.fn(async () => true) });
    const res = await login({ email: 'a@b.com', password: 'p', passphrase: 'pp' });
    expect(res).toEqual({ userId: 'u1', email: 'a@b.com', scope: 'platform' });
  });

  it('falla si la password es incorrecta', async () => {
    // solo la passphrase coincide
    const { login } = build({ verify: vi.fn(async (plain) => plain === 'pp') });
    await expect(login({ email: 'a@b.com', password: 'wrong', passphrase: 'pp' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
  });

  it('falla si la passphrase es incorrecta (doble factor)', async () => {
    // solo la password coincide
    const { login } = build({ verify: vi.fn(async (plain) => plain === 'p') });
    await expect(login({ email: 'a@b.com', password: 'p', passphrase: 'wrong' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('falla si el usuario no existe, comparando igual (tiempo constante)', async () => {
    const { login, verify } = build({ found: null, verify: vi.fn(async () => false) });
    await expect(login({ email: 'x@y.com', password: 'p', passphrase: 'pp' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(verify).toHaveBeenCalledTimes(2); // password + passphrase aunque el user sea null
  });

  it('falla si la cuenta no está activa (pendiente)', async () => {
    const { login } = build({ verify: vi.fn(async () => true), isActive: () => false });
    await expect(login({ email: 'a@b.com', password: 'p', passphrase: 'pp' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});
