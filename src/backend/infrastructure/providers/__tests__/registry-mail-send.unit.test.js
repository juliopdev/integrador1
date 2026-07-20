import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findProvider } from '../registry.js';

const mockVerify = vi.fn();
const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({
  verify: mockVerify,
  sendMail: mockSendMail,
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

describe('registry — send() por mail provider (P8.4c)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    mockVerify.mockReset();
    mockSendMail.mockReset();
    mockCreateTransport.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('smtp', () => {
    const desc = findProvider({ category: 'mail', provider: 'smtp' });
    const config = { host: 'smtp.mail.com', port: '587', user: 'u', pass: 'p', from: 'noreply@tienda.com' };

    it('testConnection valida campos requeridos y llama verify()', async () => {
      mockVerify.mockResolvedValue(true);
      expect(await desc.testConnection({ config })).toBe(true);
      expect(mockVerify).toHaveBeenCalled();

      mockVerify.mockRejectedValue(new Error('Auth failed'));
      expect(await desc.testConnection({ config })).toBe(false);

      expect(await desc.testConnection({ config: { ...config, host: '' } })).toBe(false);
      expect(await desc.testConnection({ config: { ...config, from: 'not-email' } })).toBe(false);
    });

    it('send() envía correo usando nodemailer y retorna messageId', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'smtp-123' });
      const res = await desc.send({ config, to: 'a@user.com', subject: 'Hola', html: '<p>msg</p>' });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.mail.com',
        port: 587,
        secure: false,
        auth: { user: 'u', pass: 'p' },
      });
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'noreply@tienda.com',
        to: 'a@user.com',
        subject: 'Hola',
        html: '<p>msg</p>',
      });
      expect(res).toEqual({ ok: true, id: 'smtp-123' });
    });

    it('send() con error en nodemailer retorna ok: false', async () => {
      mockSendMail.mockRejectedValue(new Error('Connection error'));
      const res = await desc.send({ config, to: 'a@user.com', subject: 'x', html: 'y' });
      expect(res).toEqual({ ok: false, error: 'Connection error' });
    });
  });
});
