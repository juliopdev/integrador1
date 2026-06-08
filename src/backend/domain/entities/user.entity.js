import { z } from 'zod';

/**
 * ES: Esquema Zod de validación estructural para usuarios finales.
 * EN: Zod structural validation schema for end-users.
 */
const userValidationSchema = z.object({
  id: z.number().optional(),
  email: z.string().email('Format email invalid / Formato de correo inválido'),
  password: z.string().min(6, 'Password must be at least 6 characters / La contraseña debe tener al menos 6 caracteres'),
  passphrase: z.string().min(4, 'Passphrase must be at least 4 characters / La frase debe tener al menos 4 caracteres').optional(),
  role: z.string().default('user'),
  status: z.enum(['active', 'suspended']).default('active'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/**
 * ES: Entidad de Dominio que representa a un Usuario Final.
 * Ejecuta validaciones estrictas al instanciar para proteger la consistencia del negocio.
 * 
 * EN: Domain Entity representing an End-User.
 * Runs strict validation upon instantiation to protect business consistency.
 */
export class UserEntity {
  /**
   * @param {Object} data - ES: Datos del usuario. EN: User details.
   */
  constructor(data) {
    Object.assign(this, UserEntity.validate(data));
  }

  /**
   * ES: Valida los datos utilizando el esquema de Zod.
   * EN: Validates data using the Zod schema.
   * 
   * @param {Object} data 
   * @returns {Object} ES: Datos validados. EN: Validated details.
   */
  static validate(data) {
    const result = userValidationSchema.safeParse(data);
    if (!result.success) {
      throw new Error(`Validation Error / Error de Validación: ${JSON.stringify(result.error.format())}`);
    }
    return result.data;
  }
}