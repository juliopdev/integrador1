import { describe, it, expect, vi } from 'vitest';
import { makeResendMasterInvitation } from '../application/resend-master-invitation.usecase.js';

function build({ tenant = { id: 't1', subdomain: 'tienda' } } = {}) {
  const tenantRepository = { findById: vi.fn(() => tenant) };
  const regenerate = vi.fn(() => ({ email: 'master@x.com', rawToken: 'raw-123' }));
  const regenerateTokenFor = vi.fn(() => regenerate);
  const sendWelcome = vi.fn(async () => ({ url: 'http://tienda.localhost/dashboard/login?tk=raw-123' }));
  return {
    uc: makeResendMasterInvitation({ tenantRepository, regenerateTokenFor, sendWelcome }),
    tenantRepository, regenerateTokenFor, regenerate, sendWelcome,
  };
}

describe('resendMasterInvitation', () => {
  it('regenera el token del tenant y despacha el correo con el subdominio correcto', async () => {
    const { uc, regenerateTokenFor, sendWelcome } = build();
    const res = await uc({ tenantId: 't1' });
    expect(res).toEqual({ email: 'master@x.com' });
    expect(regenerateTokenFor).toHaveBeenCalledWith('t1');
    expect(sendWelcome).toHaveBeenCalledWith({ email: 'master@x.com', subdomain: 'tienda', rawToken: 'raw-123' });
  });

  it('lanza TENANT_NOT_FOUND si el tenant no existe (no regenera ni envía)', async () => {
    const { uc, regenerateTokenFor, sendWelcome } = build({ tenant: null });
    await expect(uc({ tenantId: 'nope' })).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND', statusCode: 404 });
    expect(regenerateTokenFor).not.toHaveBeenCalled();
    expect(sendWelcome).not.toHaveBeenCalled();
  });
});
