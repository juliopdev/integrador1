import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { migratePlatform } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers } from '../../../config/drizzle/schema-platform.js';
import { hashSecret } from '../../../common/password.js';
import { buildApp } from '../../../kernel/app.js';

const EMAIL = 'super@baas.com';
const PASSWORD = 'Password123';
const PASSPHRASE = 'frase de paso larga';
let app;

beforeAll(async () => {
  migratePlatform(); // platform.db in-memory (NODE_ENV=test)
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
});

afterAll(async () => {
  await app?.close();
});

function login(payload) {
  return app.inject({ method: 'POST', url: '/api-system/v1/login', payload });
}

describe('POST /api-system/v1/login — login (funcional, app completa)', () => {
  it('credenciales correctas → 200 + cookie de sesión host-only', async () => {
    const res = await login({ email: EMAIL, password: PASSWORD, passphrase: PASSPHRASE });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().data.accessToken).toBe('string'); // JWT de 15 min en el body
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('platform_sid='); // sessionId, no el JWT
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('Domain='); // host-only
  });

  it('password incorrecta → 401 sin cookie', async () => {
    const res = await login({ email: EMAIL, password: 'wrong', passphrase: PASSPHRASE });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('passphrase incorrecta → 401 (doble factor)', async () => {
    const res = await login({ email: EMAIL, password: PASSWORD, passphrase: 'incorrecta' });
    expect(res.statusCode).toBe(401);
  });

  it('email inexistente → 401', async () => {
    const res = await login({ email: 'noexiste@baas.com', password: PASSWORD, passphrase: PASSPHRASE });
    expect(res.statusCode).toBe(401);
  });

  it('body inválido → 400', async () => {
    const res = await login({ email: 'no-es-email', password: PASSWORD });
    expect(res.statusCode).toBe(400);
  });
});

async function loginSession() {
  const res = await login({ email: EMAIL, password: PASSWORD, passphrase: PASSPHRASE });
  return {
    sid: res.cookies.find((c) => c.name === 'platform_sid').value,
    accessToken: res.json().data.accessToken,
  };
}

describe('GET /api-system/v1/me — sesión (funcional)', () => {
  it('con cookie de sesión válida (Valkey) → 200 + perfil sin secretos', async () => {
    const { sid } = await loginSession();
    const res = await app.inject({ method: 'GET', url: '/api-system/v1/me', cookies: { platform_sid: sid } });
    expect(res.statusCode).toBe(200);
    const user = res.json().data;
    expect(user).toMatchObject({ email: EMAIL, scope: 'platform' });
    expect(user.passwordHash).toBeUndefined();
  });

  it('con Authorization: Bearer (access token JWT) → 200', async () => {
    const { accessToken } = await loginSession();
    const res = await app.inject({
      method: 'GET',
      url: '/api-system/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('sin credenciales → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api-system/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });

  it('sessionId inexistente en Valkey → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api-system/v1/me',
      cookies: { platform_sid: 'sessionid-que-no-existe' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api-system/v1/refresh — renovación (funcional)', () => {
  it('con sesión viva → 200 + nuevo access token', async () => {
    const { sid } = await loginSession();
    const res = await app.inject({ method: 'POST', url: '/api-system/v1/refresh', cookies: { platform_sid: sid } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().data.accessToken).toBe('string');
  });

  it('sin cookie → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api-system/v1/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_SESSION');
  });
});

describe('POST /api-system/v1/logout — revocación (funcional)', () => {
  it('revoca la sesión: logout → cookie limpiada y /me + refresh dejan de funcionar', async () => {
    const { sid } = await loginSession();

    const out = await app.inject({ method: 'POST', url: '/api-system/v1/logout', cookies: { platform_sid: sid } });
    expect(out.statusCode).toBe(200);
    expect(String(out.headers['set-cookie'])).toContain('platform_sid=;'); // cookie limpiada

    // La sesión ya no existe en Valkey.
    const me = await app.inject({ method: 'GET', url: '/api-system/v1/me', cookies: { platform_sid: sid } });
    expect(me.statusCode).toBe(401);
    const ref = await app.inject({ method: 'POST', url: '/api-system/v1/refresh', cookies: { platform_sid: sid } });
    expect(ref.statusCode).toBe(401);
  });
});
