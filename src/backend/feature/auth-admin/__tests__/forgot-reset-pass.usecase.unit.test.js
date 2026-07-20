import { describe, it, expect, vi } from 'vitest';
import { makeAdminForgotPass } from '../application/forgot-pass.usecase.js';
import { makeAdminResetPass } from '../application/reset-pass.usecase.js';
import { DomainError } from '../../../common/errors.js';
import { hashToken } from '../../../common/token.js';

function makeForgotDeps({ user = null, isActive = (u) => Boolean(u?.passwordHash) } = {}) {
  const adminRepository = {
    findByEmail: vi.fn(() => user),
    isActive: vi.fn((u) => isActive(u)),
    insertPasswordResetToken: vi.fn(),
  };
  const mailer = { sendMail: vi.fn(async () => ({ id: 'm-1' })) };
  return { adminRepository, mailer, appBaseUrl: 'http://localhost:3000' };
}

describe('auth-admin forgot-pass.usecase — Superadmin (apex)', () => {
  const activeSuper = { id: 'p1', email: 'sa@baas.com', passwordHash: 'H(pw)' };

  it('Superadmin activo → correo con enlace al apex (sin subdominio)', async () => {
    const deps = makeForgotDeps({ user: activeSuper });
    const result = await makeAdminForgotPass({ ...deps, subdomain: null })({ email: 'sa@baas.com' });

    expect(deps.adminRepository.findByEmail).toHaveBeenCalledWith('sa@baas.com');
    const insert = deps.adminRepository.insertPasswordResetToken.mock.calls[0][0];
    expect(insert.userId).toBe('p1');
    expect(insert.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(insert.expiresAt).toBeGreaterThan(insert.now);

    const mail = deps.mailer.sendMail.mock.calls[0][0];
    expect(mail.to).toBe('sa@baas.com');
    // apex — hostname sin prefijo de subdominio.
    expect(mail.html).toMatch(/http:\/\/localhost:3000\/dashboard\/reset-pass\?tk=[a-f0-9]{64}/);

    expect(result.rawToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sin credenciales todavía → silencio (anti-enumeración; no revela cuenta seed)', async () => {
    const seedOnly = { id: 'p2', email: 'seed@baas.com', passwordHash: null };
    const deps = makeForgotDeps({ user: seedOnly });
    const result = await makeAdminForgotPass({ ...deps, subdomain: null })({ email: 'seed@baas.com' });
    expect(deps.adminRepository.insertPasswordResetToken).not.toHaveBeenCalled();
    expect(deps.mailer.sendMail).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('email desconocido → mismo silencio', async () => {
    const deps = makeForgotDeps({ user: null });
    await makeAdminForgotPass({ ...deps, subdomain: null })({ email: 'nadie@baas.com' });
    expect(deps.mailer.sendMail).not.toHaveBeenCalled();
  });

  it('normaliza email a lowercase antes de buscar', async () => {
    const deps = makeForgotDeps({ user: activeSuper });
    await makeAdminForgotPass({ ...deps, subdomain: null })({ email: 'SA@Baas.COM' });
    expect(deps.adminRepository.findByEmail).toHaveBeenCalledWith('sa@baas.com');
  });
});

describe('auth-admin forgot-pass.usecase — Master/Staff (subdominio)', () => {
  const activeMaster = { id: 't-m1', email: 'master@shop.com', status: 'active', passwordHash: 'H(pw)' };
  const isActive = (u) => u?.status === 'active';

  it('Master activo → correo con enlace al subdominio del tenant', async () => {
    const deps = makeForgotDeps({ user: activeMaster, isActive });
    const result = await makeAdminForgotPass({ ...deps, subdomain: 'shop' })({ email: 'master@shop.com' });

    const mail = deps.mailer.sendMail.mock.calls[0][0];
    expect(mail.html).toMatch(/http:\/\/shop\.localhost:3000\/dashboard\/reset-pass\?tk=[a-f0-9]{64}/);
    expect(result.rawToken).toBeTruthy();
  });

  it('Master invited/suspended → silencio (isActive del repo bloquea)', async () => {
    for (const status of ['invited', 'suspended']) {
      const deps = makeForgotDeps({ user: { ...activeMaster, status }, isActive });
      await makeAdminForgotPass({ ...deps, subdomain: 'shop' })({ email: 'master@shop.com' });
      expect(deps.mailer.sendMail).not.toHaveBeenCalled();
    }
  });
});

function makeResetDeps({ validToken = null } = {}) {
  const adminRepository = {
    findValidResetToken: vi.fn(() => validToken),
    updatePassword: vi.fn(),
    markTokenUsed: vi.fn(),
  };
  const hasher = { hash: vi.fn(async (v) => `H(${v})`) };
  return { adminRepository, hasher };
}

describe('auth-admin reset-pass.usecase', () => {
  it('token válido + password fuerte → actualiza password + consume token; passphrase intacta', async () => {
    const deps = makeResetDeps({ validToken: { id: 'tok-1', userId: 'u1' } });
    const raw = 'a'.repeat(64);
    const result = await makeAdminResetPass(deps)({ token: raw, password: 'NuevaPass1234' });

    expect(deps.adminRepository.findValidResetToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: hashToken(raw) }),
    );
    expect(deps.hasher.hash).toHaveBeenCalledWith('NuevaPass1234');
    const update = deps.adminRepository.updatePassword.mock.calls[0][0];
    expect(update.userId).toBe('u1');
    expect(update.passwordHash).toBe('H(NuevaPass1234)');
    // El repo debe recibir SOLO passwordHash — la passphrase no se toca (contrato de dominio).
    expect(Object.keys(update)).not.toContain('passphraseHash');
    expect(deps.adminRepository.markTokenUsed).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: 'tok-1' }),
    );
    expect(result).toEqual({ userId: 'u1' });
  });

  it('token inválido/expirado/usado → AuthError INVALID_TOKEN sin tocar el repo', async () => {
    const deps = makeResetDeps({ validToken: null });
    await expect(makeAdminResetPass(deps)({ token: 'x', password: 'MiPass1234' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    expect(deps.adminRepository.updatePassword).not.toHaveBeenCalled();
    expect(deps.adminRepository.markTokenUsed).not.toHaveBeenCalled();
  });

  it('password < 8 caracteres → DomainError WEAK_PASSWORD (rechaza antes del token)', async () => {
    const deps = makeResetDeps({ validToken: { id: 'tok-1', userId: 'u1' } });
    await expect(makeAdminResetPass(deps)({ token: 'a'.repeat(64), password: 'short' }))
      .rejects.toBeInstanceOf(DomainError);
    expect(deps.adminRepository.findValidResetToken).not.toHaveBeenCalled();
  });
});
