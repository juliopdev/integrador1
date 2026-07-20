import { describe, it, expect, vi } from 'vitest';
import { makeForgotPass } from '../application/forgot-pass.usecase.js';
import { makeResetPass } from '../application/reset-pass.usecase.js';
import { DomainError } from '../../../common/errors.js';

// Los tests aquí cubren INVARIANTES INTERNAS que no son observables via HTTP:
// contenido del correo (URL al subdominio con tk), silencio ante user suspendido,
// normalización de email, orden de guards (WEAK_PASSWORD rechaza ANTES de tocar el token).
// El flow end-to-end y los códigos de error (INVALID_TOKEN, VALIDATION_ERROR) están cubiertos
// por `forgot-reset-pass.functional.test.js`.

function makeForgotDeps({ user = null, sendResult = { id: 'm-1', sent: true } } = {}) {
  const userRepository = {
    findByEmail: vi.fn(() => user),
    insertPasswordResetToken: vi.fn(),
  };
  // P8.4: los end users reciben correos del tenant mail provider, no del platform mail.
  const sendUserMail = vi.fn(async () => sendResult);
  return { userRepository, sendUserMail, appBaseUrl: 'http://localhost:3000', subdomain: 'shop' };
}

describe('forgot-pass.usecase — invariantes internas', () => {
  const activeUser = { id: 'u1', email: 'ana@shop.com', status: 'active' };

  it('email conocido → mail al subdominio con tk crudo + hash SHA-256 persistido + expiresAt futuro', async () => {
    const deps = makeForgotDeps({ user: activeUser });
    const result = await makeForgotPass(deps)({ email: 'ana@shop.com' });

    expect(deps.userRepository.findByEmail).toHaveBeenCalledWith('ana@shop.com');
    const insertCall = deps.userRepository.insertPasswordResetToken.mock.calls[0][0];
    expect(insertCall.userId).toBe('u1');
    expect(insertCall.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(insertCall.expiresAt).toBeGreaterThan(insertCall.now);

    // El correo contiene un enlace al SUBDOMINIO con tk=<raw> — invariante que sólo se ve acá.
    const mailCall = deps.sendUserMail.mock.calls[0][0];
    expect(mailCall.to).toBe('ana@shop.com');
    expect(mailCall.html).toMatch(/http:\/\/shop\.localhost:3000\/reset-pass\?tk=[a-f0-9]{64}/);

    // El use case retorna el raw solo para tests; NO llega al cliente HTTP.
    expect(result.rawToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('user suspendido → silencioso (no mail, no token) — mismo shape que email desconocido', async () => {
    const deps = makeForgotDeps({ user: { ...activeUser, status: 'suspended' } });
    await makeForgotPass(deps)({ email: 'ana@shop.com' });
    expect(deps.userRepository.insertPasswordResetToken).not.toHaveBeenCalled();
    expect(deps.sendUserMail).not.toHaveBeenCalled();
  });

  it('P8.4: tenant sin mail provider linkeado → sendUserMail devuelve { sent: false } y NO tira', async () => {
    // El use case guarda el token igual (para que si el tenant linkea mail luego, el user
    // pueda reintentar). El mailer del tenant no lanza — silencio deliberado. Anti-enumeración.
    const deps = makeForgotDeps({ user: activeUser, sendResult: { id: null, sent: false } });
    const result = await makeForgotPass(deps)({ email: 'ana@shop.com' });

    expect(deps.userRepository.insertPasswordResetToken).toHaveBeenCalled();
    expect(deps.sendUserMail).toHaveBeenCalledTimes(1);
    expect(result.rawToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normaliza email a lowercase antes del lookup', async () => {
    const deps = makeForgotDeps({ user: activeUser });
    await makeForgotPass(deps)({ email: 'ANA@Shop.COM' });
    expect(deps.userRepository.findByEmail).toHaveBeenCalledWith('ana@shop.com');
  });
});

function makeResetDeps({ validToken = null } = {}) {
  const userRepository = {
    findValidResetToken: vi.fn(() => validToken),
    updatePassword: vi.fn(),
    markTokenUsed: vi.fn(),
  };
  const hasher = { hash: vi.fn(async (v) => `H(${v})`) };
  return { userRepository, hasher };
}

describe('reset-pass.usecase — invariantes internas', () => {
  it('password < 8 → WEAK_PASSWORD rechazado ANTES de tocar el token (guard order)', async () => {
    // Invariante importante: si password es débil, no gastamos un lookup en la DB de tokens.
    // Esto protege el rate-limit del endpoint y evita usar tokens por accidente.
    const deps = makeResetDeps({ validToken: { id: 'tok-1', userId: 'u1' } });
    await expect(makeResetPass(deps)({ token: 'a'.repeat(64), password: 'short' }))
      .rejects.toBeInstanceOf(DomainError);
    expect(deps.userRepository.findValidResetToken).not.toHaveBeenCalled();
  });
});
