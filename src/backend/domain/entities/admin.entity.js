import { z } from 'zod';

/**
 * ES: Esquema Zod de validación estructural para las cuentas administrativas.
 * EN: Zod structural validation schema for administrative accounts.
 */
const adminValidationSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  email: z.string().email('Format email invalid / Formato de correo inválido'),
  password: z.string().min(6, 'Password must be at least 6 characters / La contraseña debe tener al menos 6 caracteres'),
  passphrase: z.string().min(4, 'Passphrase must be at least 4 characters / La frase debe tener al menos 4 caracteres'),
  role: z.enum(['superadmin', 'master', 'staff']).default('superadmin'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/**
 * ES: Entidad de Dominio que representa a un Administrador (Superadmin o Master/Staff).
 * Realiza validaciones internas de forma mandatoria durante la construcción del objeto.
 * 
 * EN: Domain Entity representing an Administrator (Superadmin or Master/Staff).
 * Enforces structural validation during object instantiation.
 */
export class AdminEntity {
  /**
   * @param {Object} data - ES: Datos del administrador. EN: Admin details.
   */
  constructor(data) {
    Object.assign(this, AdminEntity.validate(data));
  }

  /**
   * ES: Valida los datos contra las reglas estructurales definidas en Zod.
   * EN: Validates data against structural rules defined in Zod.
   * 
   * @param {Object} data 
   * @returns {Object} ES: Datos validados. EN: Validated details.
   */
  static validate(data) {
    const result = adminValidationSchema.safeParse(data);
    if (!result.success) {
      throw new Error(`Validation Error / Error de Validación: ${JSON.stringify(result.error.format())}`);
    }
    return result.data;
  }
}
