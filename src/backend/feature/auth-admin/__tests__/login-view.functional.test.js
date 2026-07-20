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

describe('GET /dashboard/login (SSR)', () => {
  it('renderiza el layout auth + la página de login (HTML válido)', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/login' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');

    const html = res.body;
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('data-theme="glassmorphism"'); // layout aplica el skin
    expect(html).toContain('/styles/auth.css'); // bundle de estilos
    expect(html).toContain('Iniciar sesión'); // título de la página
    // Compone los componentes (input/button) vía include:
    expect(html).toContain('c-input__field');
    expect(html).toContain('name="passphrase"');
    expect(html).toContain('c-button--primary');
    expect(html).toContain('action="/api-system/v1/login"');
    
    // UX: El botón de submit empieza deshabilitado (disabled)
    expect(html).toContain('disabled');
    expect(html).toContain('¿Olvidaste tu contraseña?');
  });

  it('muestra el alert de error si ?error= viene en la query', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/login?error=Credenciales%20inv%C3%A1lidas' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('c-alert--error');
    expect(res.body).toContain('Credenciales inválidas');
  });

  it('renderiza el formulario de activación si ?tk= viene en la query', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/login?tk=TEST_TOKEN_XYZ' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Definir credenciales');
    expect(res.body).toContain('Activa tu cuenta configurando tu contraseña y frase de paso');
    expect(res.body).toContain('type="hidden"');
    expect(res.body).toContain('name="token"');
    expect(res.body).toContain('value="TEST_TOKEN_XYZ"');
    expect(res.body).toContain('name="password"');
    expect(res.body).toContain('name="passphrase"');
    expect(res.body).not.toContain('name="email"');
    expect(res.body).toContain('data-redirect="/dashboard/login?activated=1"');
    expect(res.body).toContain('Activar cuenta');
    // UX: El botón empieza deshabilitado y tiene enlace para volver
    expect(res.body).toContain('disabled');
    expect(res.body).toContain('Volver a iniciar sesión');
  });

  it('muestra la alerta de éxito si ?activated=1 viene en la query', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/login?activated=1' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('c-alert--success');
    expect(res.body).toContain('Cuenta activada con éxito');
    expect(res.body).toContain('Iniciar sesión');
  });
});

describe('Redirección de sesión activa (flows.md)', () => {
  let platformSid;

  beforeAll(async () => {
    // Obtener sesión válida
    const res = await app.inject({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { email: EMAIL, password: PASSWORD, passphrase: PASSPHRASE }
    });
    platformSid = res.cookies.find(c => c.name === 'platform_sid').value;
  });

  it('si tiene sesión activa → GET /dashboard/login redirige a /dashboard', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/login',
      cookies: { platform_sid: platformSid }
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('si tiene sesión activa pero viene con tk → GET /dashboard/login?tk=... NO redirige (permite activar)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/login?tk=SOME_TOKEN',
      cookies: { platform_sid: platformSid }
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Definir credenciales');
  });

  it('si tiene sesión activa → GET /dashboard/forgot-pass redirige a /dashboard', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/forgot-pass',
      cookies: { platform_sid: platformSid }
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  it('si tiene sesión activa → GET /dashboard/reset-pass redirige a /dashboard', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/reset-pass',
      cookies: { platform_sid: platformSid }
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });
});
