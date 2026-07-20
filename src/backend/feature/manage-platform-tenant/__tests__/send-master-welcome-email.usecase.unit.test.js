import { describe, it, expect, vi } from 'vitest';
import { makeSendMasterWelcomeEmail } from '../application/send-master-welcome-email.usecase.js';

describe('sendMasterWelcomeEmail', () => {
  it('envía al Master un enlace de activación al subdominio con el token en la query', async () => {
    const mailer = { sendMail: vi.fn(async () => ({ id: 'x' })) };
    const uc = makeSendMasterWelcomeEmail({ mailer, appBaseUrl: 'https://juliopariona.com' });

    const { url } = await uc({ email: 'master@tienda.com', subdomain: 'tienda', rawToken: 'RAW123' });

    expect(url).toBe('https://tienda.juliopariona.com/dashboard/login?tk=RAW123');
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'master@tienda.com', subject: expect.any(String) }),
    );
    expect(mailer.sendMail.mock.calls[0][0].html).toContain('tienda.juliopariona.com/dashboard/login?tk=RAW123');
  });

  it('funciona con APP_URL de desarrollo (subdominio sobre localhost)', async () => {
    const mailer = { sendMail: vi.fn(async () => ({ id: 'x' })) };
    const uc = makeSendMasterWelcomeEmail({ mailer, appBaseUrl: 'http://localhost:3000' });

    const { url } = await uc({ email: 'm@t.com', subdomain: 'tienda', rawToken: 'R' });

    expect(url).toBe('http://tienda.localhost:3000/dashboard/login?tk=R');
  });
});
