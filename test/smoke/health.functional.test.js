/**
 * Smoke test funcional del endpoint /health.
 * Verifica que la app completa arranca y responde 200 con el estado
 * de todas las dependencias (platformDb, valkey) en OK.
 *
 * @module HealthFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/backend/kernel/app.js';

let app;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app?.close();
});

describe('smoke /health (funcional, con mocks)', () => {
  it('la app completa arranca y responde 200 con dependencias OK', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.dependencies.platformDb).toBe(true);
    expect(body.dependencies.valkey).toBe(true);
  });
});
