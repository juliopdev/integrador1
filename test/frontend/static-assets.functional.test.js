/**
 * Pruebas funcionales de assets estáticos servidos por @fastify/static.
 * Verifica que el build de Vite (styles + scripts) se sirve correctamente
 * con los content-types adecuados. Requiere `pnpm build` previo.
 *
 * @module StaticAssetsFunctionalTest
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildApp } from '../../src/backend/kernel/app.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
// Requiere `pnpm build` previo (assets en public/). Se omite si no se construyó.
const built = existsSync(join(ROOT, 'public', 'styles', 'auth.css'));
const suite = built ? describe : describe.skip;

let app;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app?.close();
});

suite('assets estáticos (build de Vite + @fastify/static)', () => {
  it('GET /styles/auth.css → 200 con custom properties del tema', async () => {
    const res = await app.inject({ method: 'GET', url: '/styles/auth.css' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('css');
    expect(res.body).toContain('--color-bg');
    expect(res.body).toContain('.c-button'); // componentes suscritos emitidos
  });

  it('GET /scripts/auth-entry.js → 200 (bundle de scripts)', async () => {
    const res = await app.inject({ method: 'GET', url: '/scripts/auth-entry.js' });
    expect(res.statusCode).toBe(200);
  });
});
