/**
 * Schemas Zod de validación de entrada para las rutas API de auth-admin.
 * @module in.schema
 */

import { z } from 'zod';

/**
 * Schema de validación para activación de cuenta administrativa por token.
 * Requiere token, password (≥8) y passphrase (≥12) según security.md.
 */
export const activateSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  passphrase: z.string().min(12),
});

/**
 * Schema de validación para inicio de sesión administrativo.
 * Solo exige presencia de los campos; la política real la valida el use case (doble factor).
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  passphrase: z.string().min(1),
});

/**
 * Schema de validación para solicitud de restablecimiento de contraseña.
 * Solo requiere email. La respuesta es siempre 200 (anti-enumeración).
 */
export const forgotPassSchema = z.object({
  email: z.string().email(),
});

/**
 * Schema de validación para consumo de token de restablecimiento.
 * Requiere token crudo y nueva password (≥8). La passphrase no se resetea aquí.
 */
export const resetPassSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
