import fastifySecureSession from '@fastify/secure-session';
import fastifyPassport from '@fastify/passport';
import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Registra @fastify/passport + @fastify/secure-session para autenticación OAuth.
 *
 * `secure-session` cifra la cookie de estado transitorio (`state`/`nonce`) durante el handshake
 * OAuth de Google — NO es la sesión principal (esa vive en Valkey como JWT, ver security.md).
 * La clave de cifrado se deriva de `SESSION_SECRET` vía HMAC-SHA256 (32 bytes exactos para sodium
 * secretbox, sin requerir un archivo de clave externo). La cookie expira a los 10 minutos.
 *
 * Las **estrategias** (passport-local, passport-google-oauth20) se registran en los features de
 * auth (Fase 1/5), no aquí — ver `bootstrap/register-passport.js`.
 *
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 * @returns {Promise<void>}
 */
export async function registerPassport(app) {
  // Derivar clave de 32 bytes para sodium secretbox.
  const key = createHmac('sha256', 'baas-secure-session').update(env.SESSION_SECRET).digest();

  await app.register(fastifySecureSession, {
    key,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60, // 10 min — solo para el handshake transitorio de OAuth
    },
  });

  await app.register(fastifyPassport.initialize());
  await app.register(fastifyPassport.secureSession());
}
