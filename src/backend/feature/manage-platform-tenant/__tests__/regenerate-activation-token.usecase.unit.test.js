import { describe, it, expect, vi } from 'vitest';
import { makeRegenerateActivationToken } from '../application/regenerate-activation-token.usecase.js';

function build({ master = { id: 'u1', email: 'master@x.com', status: 'invited' } } = {}) {
  const onboardingRepository = {
    findMaster: vi.fn(() => master),
    deleteActivationTokens: vi.fn(),
    insertActivationToken: vi.fn(),
  };
  return { uc: makeRegenerateActivationToken({ onboardingRepository, now: () => 1000, ttlMs: 500 }), onboardingRepository };
}

describe('regenerateActivationToken', () => {
  it('master invited: invalida tokens previos, inserta uno nuevo y devuelve { email, rawToken }', () => {
    const { uc, onboardingRepository } = build();
    const res = uc();
    expect(res.email).toBe('master@x.com');
    expect(typeof res.rawToken).toBe('string');
    expect(res.rawToken.length).toBeGreaterThan(0);
    expect(onboardingRepository.deleteActivationTokens).toHaveBeenCalledWith({ userId: 'u1' });
    expect(onboardingRepository.insertActivationToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', expiresAt: 1500, now: 1000 }),
    );
    // El token crudo NUNCA se persiste: sólo su hash.
    const insertArg = onboardingRepository.insertActivationToken.mock.calls[0][0];
    expect(insertArg.tokenHash).toBeDefined();
    expect(insertArg.tokenHash).not.toBe(res.rawToken);
  });

  it('master ya activo → MASTER_ALREADY_ACTIVE (422), no toca tokens', () => {
    const { uc, onboardingRepository } = build({ master: { id: 'u1', email: 'm@x.com', status: 'active' } });
    expect(() => uc()).toThrow(expect.objectContaining({ code: 'MASTER_ALREADY_ACTIVE', statusCode: 422 }));
    expect(onboardingRepository.insertActivationToken).not.toHaveBeenCalled();
    expect(onboardingRepository.deleteActivationTokens).not.toHaveBeenCalled();
  });

  it('sin master asignado → MASTER_NOT_FOUND (404)', () => {
    const { uc } = build({ master: null });
    expect(() => uc()).toThrow(expect.objectContaining({ code: 'MASTER_NOT_FOUND', statusCode: 404 }));
  });
});
