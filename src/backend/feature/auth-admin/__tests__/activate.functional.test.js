/**
 * Prueba funcional del flujo de activación de superadmin.
 * Verifica: validación de passphrase corta, token inválido → 422,
 * token válido → credenciales persistidas y token consumido (reuso → 422).
 *
 * @module AuthAdminActivateFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { migratePlatform } from '../../../config/drizzle/migrator.js';
import { platformDb } from '../../../config/database/platform/sqlite-platform.js';
import { platformUsers, authTokens } from '../../../config/drizzle/schema-platform.js';
import { buildApp } from '../../../kernel/app.js';

const RAW = 'activation-raw-token-xyz';
let app;

beforeAll(async () => {
  migratePlatform(); // platform.db in-memory (NODE_ENV=test)
  const now = Date.now();
  platformDb.insert(platformUsers).values({ id: 'sa', email: 'super@baas.com', createdAt: now, updatedAt: now }).run();
  platformDb
    .insert(authTokens)
    .values({
      id: 'tk',
      userId: 'sa',
      type: 'activation',
      tokenHash: createHash('sha256').update(RAW).digest('hex'),
      expiresAt: now + 60_000,
      createdAt: now,
    })
    .run();
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
});

describe('POST /api-system/v1/login — activación (funcional, app completa)', () => {
  it('passphrase corta → 400 (validación, antes de tocar el token)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { token: RAW, password: 'Password123', passphrase: 'corta' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('token inválido → 422 INVALID_OR_EXPIRED_TOKEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { token: 'bad-token', password: 'Password123', passphrase: 'frase de paso larga' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('token válido + creds → 200 y credenciales definidas (token consumido)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { token: RAW, password: 'Password123', passphrase: 'frase de paso larga' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: null });

    const u = platformDb.select().from(platformUsers).where(eq(platformUsers.id, 'sa')).get();
    expect(u.passwordHash).toBeTruthy();
    expect(u.passphraseHash).toBeTruthy();

    // Reutilizar el token consumido → 422
    const reuse = await app.inject({
      method: 'POST',
      url: '/api-system/v1/login',
      payload: { token: RAW, password: 'Password123', passphrase: 'frase de paso larga' },
    });
    expect(reuse.statusCode).toBe(422);
  });
});
