import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { migratePlatform } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers, authTokens } from '../../../config/drizzle/schema-platform.js';
import { hashSecret, verifySecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';
import { eq } from 'drizzle-orm';

// Mockeamos el mailer para NO enviar correo real durante el flujo funcional. Capturamos el HTML
// para extraer el `?tk=` — el use case no expone el token en el JSON (anti-leak).
vi.mock('../../../infrastructure/providers/mail.adapter.js', async () => ({
  sendMail: vi.fn(async () => ({ id: 'mock-mail' })),
}));

const EMAIL = 'super@baas.com';
const PASSWORD = 'Password123';
const NEW_PASSWORD = 'BrandNewPass1';
const PASSPHRASE = 'frase de paso larga';
let app;
let sendMailSpy;

beforeAll(async () => {
  migratePlatform();
  const now = Date.now();
  platformDb
    .insert(platformUsers)
    .values({
      id: 'sa',
      email: EMAIL,
      passwordHash: await hashSecret(PASSWORD),
      passphraseHash: await hashSecret(PASSPHRASE),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  app = await buildApp();
  const mailMod = await import('../../../infrastructure/providers/mail.adapter.js');
  sendMailSpy = mailMod.sendMail;
});

afterAll(async () => {
  await app?.close();
});

function post(url, payload) {
  return app.inject({ method: 'POST', url, payload });
}

function extractTokenFromHtml(html) {
  const match = html.match(/tk=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

describe('POST /api-system/v1/forgot-pass — solicitud (funcional, Superadmin)', () => {
  it('email conocido → 200 vacío + envía correo con link apex al Superadmin', async () => {
    sendMailSpy.mockClear();
    const res = await post('/api-system/v1/forgot-pass', { email: EMAIL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: null });
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const mail = sendMailSpy.mock.calls[0][0];
    expect(mail.to).toBe(EMAIL);
    // Apex (sin subdominio) — el hostname es el de APP_URL directo.
    expect(mail.html).toMatch(/\/dashboard\/reset-pass\?tk=[a-f0-9]{64}/);
  });

  it('email desconocido → 200 idéntico + NO envía correo (anti-enumeración)', async () => {
    sendMailSpy.mockClear();
    const res = await post('/api-system/v1/forgot-pass', { email: 'nadie@baas.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: null });
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it('email inválido → 400 VALIDATION_ERROR', async () => {
    const res = await post('/api-system/v1/forgot-pass', { email: 'no-es-email' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('normaliza email a lowercase (mayúsculas siguen encontrando la cuenta)', async () => {
    sendMailSpy.mockClear();
    const res = await post('/api-system/v1/forgot-pass', { email: 'SUPER@Baas.COM' });
    expect(res.statusCode).toBe(200);
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api-system/v1/reset-pass — consumo (funcional, Superadmin)', () => {
  it('token válido → actualiza password, deja passphrase intacta, invalida re-uso', async () => {
    sendMailSpy.mockClear();
    // 1. Disparar forgot-pass y extraer el token del correo mockeado.
    await post('/api-system/v1/forgot-pass', { email: EMAIL });
    const html = sendMailSpy.mock.calls[0][0].html;
    const rawToken = extractTokenFromHtml(html);
    expect(rawToken).toBeTruthy();

    // 2. Consumir el token con nueva password.
    const res = await post('/api-system/v1/reset-pass', { token: rawToken, password: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: null });

    // 3. Password realmente rotada (el hash nuevo verifica; el viejo no).
    const rows = platformDb.select().from(platformUsers).where(eq(platformUsers.id, 'sa')).all();
    const user = rows[0];
    expect(await verifySecret(NEW_PASSWORD, user.passwordHash)).toBe(true);
    expect(await verifySecret(PASSWORD, user.passwordHash)).toBe(false);
    // Passphrase intacta — sigue verificando la original (no la tocamos).
    expect(await verifySecret(PASSPHRASE, user.passphraseHash)).toBe(true);

    // 4. Anti-replay: el token quedó marcado usado → un segundo reset con el mismo raw falla.
    const replay = await post('/api-system/v1/reset-pass', { token: rawToken, password: 'OtroValido123' });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe('INVALID_TOKEN');
  });

  it('token inexistente → 401 INVALID_TOKEN', async () => {
    const res = await post('/api-system/v1/reset-pass', { token: 'x'.repeat(64), password: 'Valida12345' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_TOKEN');
  });

  it('password < 8 → 400 VALIDATION_ERROR (rechazo del schema HTTP, sin tocar el use case)', async () => {
    const res = await post('/api-system/v1/reset-pass', { token: 'a'.repeat(64), password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('SSR — páginas de forgot/reset', () => {
  it('GET /dashboard/forgot-pass renderiza el form al endpoint API', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/forgot-pass' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('action="/api-system/v1/forgot-pass"');
    expect(res.body).toContain('name="email"');
  });

  it('GET /dashboard/reset-pass?tk=... renderiza el form con hidden token', async () => {
    const raw = 'a'.repeat(64);
    const res = await app.inject({ method: 'GET', url: `/dashboard/reset-pass?tk=${raw}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(`value="${raw}"`);
    expect(res.body).toContain('name="password"');
    expect(res.body).toContain('action="/api-system/v1/reset-pass"');
  });

  it('GET /dashboard/reset-pass sin ?tk → muestra alerta de enlace inválido, no el form de reset', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/reset-pass' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Enlace inválido');
    expect(res.body).not.toContain('name="password"');
  });
});
