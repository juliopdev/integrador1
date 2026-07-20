import { describe, it, expect, vi } from 'vitest';
import { makeUpdateProviderSettings } from '../application/update-provider-settings.usecase.js';

/**
 * P8.4b: `updateProviderSettings` valida contra el registry — sólo permite keys declaradas.
 * Coerciona strings/arrays a boolean para campos declared as `checkbox` (contract con el form SSR
 * y su hidden-twin pattern).
 */
describe('update-provider-settings — validación por registry + coerción checkbox', () => {
  function build({ updated = true } = {}) {
    const providerRepository = {
      updateSettings: vi.fn(() => ({ updated })),
    };
    return { uc: makeUpdateProviderSettings({ providerRepository, now: () => 1000 }), providerRepository };
  }

  it('happy path (mail/resend, toggles válidos con boolean) → guarda settings y retorna category+provider', async () => {
    const { uc, providerRepository } = build();
    const res = await uc({
      category: 'mail', provider: 'resend',
      settings: { toggles: { userAuth: true, userSupport: false } },
    });
    expect(res).toEqual({
      category: 'mail', provider: 'resend',
      settings: { toggles: { userAuth: true, userSupport: false } },
    });
    expect(providerRepository.updateSettings).toHaveBeenCalledWith({
      category: 'mail', provider: 'resend',
      settingsJson: JSON.stringify({ toggles: { userAuth: true, userSupport: false } }),
      now: 1000,
    });
  });

  it('coerce string "true"/"false" a boolean (form SSR single input)', async () => {
    const { uc, providerRepository } = build();
    await uc({
      category: 'mail', provider: 'resend',
      settings: { toggles: { userAuth: 'true', userSupport: 'false' } },
    });
    expect(providerRepository.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      settingsJson: JSON.stringify({ toggles: { userAuth: true, userSupport: false } }),
    }));
  });

  it('coerce array ["false","true"] a true (hidden-twin, checkbox marcado)', async () => {
    const { uc, providerRepository } = build();
    await uc({
      category: 'mail', provider: 'resend',
      settings: { toggles: { userAuth: ['false', 'true'] } },
    });
    expect(providerRepository.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      settingsJson: JSON.stringify({ toggles: { userAuth: true } }),
    }));
  });

  it('array ["false"] (checkbox NO marcado) coerce a false', async () => {
    const { uc, providerRepository } = build();
    await uc({
      category: 'mail', provider: 'resend',
      settings: { toggles: { userAuth: ['false'] } },
    });
    expect(providerRepository.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      settingsJson: JSON.stringify({ toggles: { userAuth: false } }),
    }));
  });

  it('key desconocida → 422 INVALID_SETTINGS_KEY', async () => {
    const { uc, providerRepository } = build();
    await expect(uc({
      category: 'mail', provider: 'resend',
      settings: { toggles: { userMarketing: true } }, // no declarada en registry
    })).rejects.toMatchObject({ code: 'INVALID_SETTINGS_KEY' });
    expect(providerRepository.updateSettings).not.toHaveBeenCalled();
  });

  it('tipo inválido (checkbox recibe número) → 422 INVALID_SETTINGS_TYPE', async () => {
    const { uc } = build();
    await expect(uc({
      category: 'mail', provider: 'resend',
      settings: { toggles: { userAuth: 42 } },
    })).rejects.toMatchObject({ code: 'INVALID_SETTINGS_TYPE' });
  });

  it('provider desconocido → 404 PROVIDER_UNKNOWN', async () => {
    const { uc } = build();
    await expect(uc({
      category: 'mail', provider: 'no-existe',
      settings: {},
    })).rejects.toMatchObject({ code: 'PROVIDER_UNKNOWN' });
  });

  it('provider no linkeado (repo devuelve updated=false) → 404 PROVIDER_NOT_LINKED', async () => {
    const { uc } = build({ updated: false });
    await expect(uc({
      category: 'mail', provider: 'resend',
      settings: { toggles: { userAuth: true } },
    })).rejects.toMatchObject({ code: 'PROVIDER_NOT_LINKED' });
  });
});
