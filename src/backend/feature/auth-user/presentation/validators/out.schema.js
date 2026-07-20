import { z } from 'zod';

// Serializadores estrictos (Zod `strip`) para las rutas de auth-user. Nunca deben viajar
// `passwordHash`, `passphraseHash`, ni tokens crudos — solo el par (userId, email) y el
// access token JWT firmado.

/**
 * Schema de serialización para respuesta de registro de end-user.
 * Devuelve el identificador único y el email normalizado del nuevo usuario.
 */
export const registerResultSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
});

/**
 * Schema de serialización para respuesta de login de end-user.
 * Solo contiene el access token JWT (la sesión viaja por cookie httpOnly).
 */
export const loginResultSchema = z.object({
  accessToken: z.string().min(1),
});

/**
 * Schema de serialización para renovación de access token de end-user.
 * Alias documental de loginResultSchema (mismo formato de respuesta).
 */
export const refreshResultSchema = loginResultSchema;
