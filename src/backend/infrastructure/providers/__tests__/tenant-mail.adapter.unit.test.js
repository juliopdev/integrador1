import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendUserMail } from '../tenant-mail.adapter.js';

// P8.4c: la lógica per-provider vive en `desc.send` del registry. Mockeamos `findProvider` para
// aislar el contrato del adapter (delegación + gates de toggle/mailType/settings), sin depender
// de la implementación real de Resend/Mailgun/SendGrid.
vi.mock('../../../common/crypto.js', () => ({
  encrypt: (v) => ({ ct: v }),
  decrypt: (blob) => blob.ct,
}));

const mockSend = vi.fn(async () => ({ ok: true, id: 'provider-abc' }));
vi.mock('../registry.js', () => ({
  findProvider: vi.fn(({ provider }) => ({
    operable: provider === 'resend' || provider === 'smtp',
    send: (provider === 'resend' || provider === 'smtp') ? mockSend : undefined,
  })),
}));

function makeTenantDb(providerRow) {
  if (providerRow && providerRow.settingsJson === undefined) {
    providerRow.settingsJson = JSON.stringify({ toggles: { userAuth: true, userSupport: true } });
  }
  const chain = {
    select: () => chain, from: () => chain, where: () => chain, limit: () => chain,
    all: () => (providerRow ? [providerRow] : []),
  };
  return chain;
}

describe('sendUserMail — tenant mail adapter (P8.4)', () => {
  beforeEach(() => { mockSend.mockClear().mockResolvedValue({ ok: true, id: 'provider-abc' }); });

  it('sin provider linkeado → { sent: false } silencioso (NO throw)', async () => {
    const tenantDb = makeTenantDb(null);
    const res = await sendUserMail({ tenantDb, mailType: 'userAuth', to: 'a@user.com', subject: 'x', html: '<p>y</p>' });
    expect(res).toEqual({ id: null, sent: false });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('mailType desconocido → throw INVALID_MAIL_TYPE (fail-closed)', async () => {
    const tenantDb = makeTenantDb(null);
    await expect(sendUserMail({ tenantDb, mailType: 'userMarketing', to: 'a@user.com', subject: 'x', html: 'y' }))
      .rejects.toMatchObject({ code: 'INVALID_MAIL_TYPE', statusCode: 500 });
  });

  it('provider operable + toggle ON → delega a desc.send y devuelve id', async () => {
    const config = { apiKey: 're_realkey', from: 'noreply@tienda.com' };
    const tenantDb = makeTenantDb({ provider: 'resend', configValuesJson: JSON.stringify({ ct: JSON.stringify(config) }) });
    const res = await sendUserMail({ tenantDb, mailType: 'userAuth', to: 'a@user.com', subject: 'Hola', html: '<p>msg</p>' });

    expect(mockSend).toHaveBeenCalledWith({ config, to: 'a@user.com', subject: 'Hola', html: '<p>msg</p>' });
    expect(res).toEqual({ id: 'provider-abc', sent: true });
  });

  it('P8.4c: cualquier provider operable (smtp) delega igual — mismo camino', async () => {
    const config = { host: 'smtp.mail.com', port: '587', user: 'u', pass: 'p', from: 'noreply@tienda.com' };
    const tenantDb = makeTenantDb({ provider: 'smtp', configValuesJson: JSON.stringify({ ct: JSON.stringify(config) }) });
    const res = await sendUserMail({ tenantDb, mailType: 'userAuth', to: 'a@user.com', subject: 'Hola', html: '<p>msg</p>' });

    expect(mockSend).toHaveBeenCalledWith({ config, to: 'a@user.com', subject: 'Hola', html: '<p>msg</p>' });
    expect(res).toEqual({ id: 'provider-abc', sent: true });
  });

  it('P8.4b: toggle userAuth=false → silencio (no llama send)', async () => {
    const config = { apiKey: 're_realkey', from: 'noreply@tienda.com' };
    const tenantDb = makeTenantDb({
      provider: 'resend',
      configValuesJson: JSON.stringify({ ct: JSON.stringify(config) }),
      settingsJson: JSON.stringify({ toggles: { userAuth: false, userSupport: true } }),
    });
    const res = await sendUserMail({ tenantDb, mailType: 'userAuth', to: 'a@user.com', subject: 'x', html: 'y' });
    expect(res).toEqual({ id: null, sent: false });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('P8.4b: toggle userAuth=false + mailType=userSupport (true) → envía', async () => {
    const config = { apiKey: 're_realkey', from: 'noreply@tienda.com' };
    const tenantDb = makeTenantDb({
      provider: 'resend',
      configValuesJson: JSON.stringify({ ct: JSON.stringify(config) }),
      settingsJson: JSON.stringify({ toggles: { userAuth: false, userSupport: true } }),
    });
    const res = await sendUserMail({ tenantDb, mailType: 'userSupport', to: 'a@user.com', subject: 'ayuda', html: 'y' });
    expect(res).toEqual({ id: 'provider-abc', sent: true });
    expect(mockSend).toHaveBeenCalled();
  });

  it('P8.4b: settingsJson null → toggle undefined → silencio (fail-closed)', async () => {
    const config = { apiKey: 're_realkey', from: 'noreply@tienda.com' };
    const tenantDb = makeTenantDb({
      provider: 'resend',
      configValuesJson: JSON.stringify({ ct: JSON.stringify(config) }),
      settingsJson: null,
    });
    const res = await sendUserMail({ tenantDb, mailType: 'userAuth', to: 'a@user.com', subject: 'x', html: 'y' });
    expect(res).toEqual({ id: null, sent: false });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('config corrupto (JSON inválido) → { sent: false } silencioso + log error', async () => {
    const tenantDb = makeTenantDb({ provider: 'resend', configValuesJson: '{{ not-json' });
    const res = await sendUserMail({ tenantDb, mailType: 'userAuth', to: 'a@user.com', subject: 'x', html: 'y' });
    expect(res).toEqual({ id: null, sent: false });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('provider registrado pero no operable (desconocido) → { sent: false } silencioso', async () => {
    const tenantDb = makeTenantDb({ provider: 'desconocido', configValuesJson: JSON.stringify({ ct: JSON.stringify({ apiKey: 'x' }) }) });
    const res = await sendUserMail({ tenantDb, mailType: 'userAuth', to: 'a@user.com', subject: 'x', html: 'y' });
    expect(res).toEqual({ id: null, sent: false });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('desc.send devuelve { ok: false } → propaga como AppError 502', async () => {
    mockSend.mockResolvedValueOnce({ ok: false, error: 'domain not verified' });
    const config = { apiKey: 're_realkey', from: 'noreply@tienda.com' };
    const tenantDb = makeTenantDb({ provider: 'resend', configValuesJson: JSON.stringify({ ct: JSON.stringify(config) }) });

    await expect(sendUserMail({ tenantDb, mailType: 'userAuth', to: 'a@user.com', subject: 'x', html: 'y' })).rejects.toMatchObject({
      code: 'TENANT_EMAIL_SEND_FAILED',
      statusCode: 502,
    });
  });
});
