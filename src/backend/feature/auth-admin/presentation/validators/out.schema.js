/**
 * Schemas Zod de serialización de salida para respuestas de auth-admin.
 * Blindan las respuestas: jamás viajan hashes, tokens crudos ni campos de auditoría internos.
 * @module out.schema
 */

import { z } from 'zod';

/**
 * Schema de serialización para respuesta de login/refresh.
 * Solo contiene el access token JWT (la sesión viaja por cookie httpOnly, no por body).
 * @typedef {Object} AuthLoginResult
 * @property {string} accessToken - Access token JWT firmado.
 */
export const loginResultSchema = z.object({
  accessToken: z.string().min(1),
});

/**
 * Schema de serialización para renovación de access token.
 * Alias documental de loginResultSchema (mismo formato de respuesta).
 * @typedef {AuthLoginResult} AuthRefreshResult
 */
export const refreshResultSchema = loginResultSchema;

/**
 * Schema de serialización para el perfil devuelto por `GET /me`.
 * El hook `session-auth` ya construye una identidad segura con estos campos.
 * @typedef {Object} AuthMeResult
 * @property {string} id - ID único del usuario.
 * @property {string} email - Correo electrónico.
 * @property {'platform'|'tenant'} scope - Alcance de la sesión.
 * @property {string|null} tenantId - ID del tenant (null si scope=platform).
 */
export const meResultSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  scope: z.enum(['platform', 'tenant']),
  tenantId: z.string().nullable(),
});
