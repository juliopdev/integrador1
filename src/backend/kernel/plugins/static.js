import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// plugins → kernel → backend → src → raíz del proyecto → public/ (assets compilados por Vite).
const PUBLIC_DIR = join(here, '..', '..', '..', '..', 'public');

/**
 * Sirve los assets compilados de Vite (`/styles/*.css`, `/scripts/*.js`) desde el directorio `public/`.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 */
export async function registerStatic(app) {
  await app.register(fastifyStatic, { root: PUBLIC_DIR, prefix: '/' });
}
