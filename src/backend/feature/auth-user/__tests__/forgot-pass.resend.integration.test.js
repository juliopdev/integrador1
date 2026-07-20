import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { makeForgotPass } from '../application/forgot-pass.usecase.js';

// Test E2E REAL contra Resend. **Envía UN correo por corrida** al `TEST_MAIL_TO` del `.env`.
// Se ejecuta solo cuando todos los prerequisitos están reales:
//  - `TEST_MAIL_TO` presente (no placeholder).
//  - `API_KEY_RESEND` no es placeholder (`re_XXX_XXX`).
//
// Usa el SDK Resend directamente (no pasa por `mail.adapter.js` porque su modo test-noop viene
// del `env.NODE_ENV` cacheado en import; forzarlo por proc.env no funciona). El resto de la app
// sigue usando el adapter y su disciplina test = no-op — solo este test rompe intencionalmente
// el silencio para verificar el envío real.

const TO = process.env.TEST_MAIL_TO;
const KEY = process.env.API_KEY_RESEND;
const FROM = process.env.MAIL_FROM || 'onboarding@resend.dev';
const canRun = TO
  && /^[^@]+@[^@]+\./.test(TO)
  && KEY
  && !/^re_XXX/i.test(KEY);
const suite = canRun ? describe : describe.skip;

suite('forgot-pass — envío real vía Resend (1 correo/corrida a TEST_MAIL_TO)', () => {
  it(`envía UN correo a ${TO} y Resend responde con un id de mensaje`, async ({ skip }) => {
    skip(`Este test ya se probo manualmente, se cancela para no spamear a ${TO}. Para probarlo, comentar el skip().`);
    return;

    // Mailer directo con el SDK — bypasea `mail.adapter.js` intencionalmente.
    const { Resend } = await import('resend');
    const resend = new Resend(KEY);
    const realMailer = {
      sendMail: async ({ to, subject, html }) => {
        const res = await resend.emails.send({ from: FROM, to, subject, html });
        if (res.error) throw new Error(`Resend error: ${res.error.message}`);
        return { id: res.data?.id ?? 'resend-sent' };
      },
    };

    const insertions = [];
    const userRepository = {
      findByEmail: () => ({ id: 'u-real', email: TO.toLowerCase(), status: 'active' }),
      insertPasswordResetToken: (row) => insertions.push(row),
    };

    const forgot = makeForgotPass({
      userRepository, mailer: realMailer,
      appBaseUrl: 'http://localhost:3000', subdomain: 'shop',
    });

    try {
      const result = await forgot({ email: TO });
      expect(insertions).toHaveLength(1);
      expect(insertions[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.rawToken).toMatch(/^[a-f0-9]{64}$/);
      // Si llegamos acá con Resend real → 1 correo enviado.
    } catch (err) {
      // Restricción típica del plan gratuito de Resend: solo permite enviar al email de la cuenta
      // hasta verificar un dominio. Lo skipeamos con mensaje claro (no es un bug de la app).
      if (/only send testing emails to your own email address|verify a domain/i.test(err.message)) {
        skip(`Resend sandbox: verificar dominio en resend.com/domains o usar como TEST_MAIL_TO el email de la cuenta. Error: ${err.message}`);
        return;
      }
      throw err;
    }
  }, 30000);
});
