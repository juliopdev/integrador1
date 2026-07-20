/**
 * Schemas Zod de validación de entrada para las rutas API de auth-user.
 * @module in.schema
 */

import { z } from 'zod';

/**
 * Schema de validación para auto-registro de end-user.
 * Requiere email y contraseña con mínimo 8 caracteres según security.md.
 */
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Schema de validación para login local de end-user.
 * Solo exige presencia de campos; la política real la valida el use case.
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Schema de validación para solicitud de restablecimiento de contraseña.
 * Solo requiere email. La respuesta es siempre 200 (anti-enumeración de cuentas).
 */
export const forgotPassSchema = z.object({
  email: z.string().email(),
});

/**
 * Schema de validación para consumo de token de restablecimiento de contraseña.
 * Requiere token crudo y nueva contraseña con mínimo 8 caracteres.
 */
export const resetPassSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
