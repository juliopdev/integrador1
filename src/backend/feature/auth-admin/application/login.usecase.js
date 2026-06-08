import bcrypt from 'bcryptjs';

/**
 * ES: Caso de Uso para iniciar sesión administrativa (Superadmin o Master/Staff).
 * Compara las contraseñas cifradas y genera el conjunto de tokens JWT.
 * 
 * EN: Use Case to perform administrative login (Superadmin or Master/Staff).
 * Compares hashed passwords and generates the set of JWT tokens.
 */
export class LoginAdminUseCase {
  /**
   * @param {Object} cradle 
   * @param {import('../infrastructure/admin.repository').AdminRepository} cradle.adminRepository 
   * @param {import('../../../kernel/container/di-register/auth/jwt.module').TokenService} cradle.tokenService
   */
  constructor({ adminRepository, tokenService }) {
    this.adminRepository = adminRepository;
    this.tokenService = tokenService;
  }

  /**
   * ES: Ejecuta el flujo de autenticación del administrador.
   * EN: Runs the administrator authentication workflow.
   * 
   * @param {Object} credentials 
   * @param {string} credentials.email 
   * @param {string} credentials.password 
   * @param {string} [credentials.tenantId] - ES: Identificador del inquilino (nulo si es Superadmin). EN: Tenant identifier (null if Superadmin).
   * @returns {Promise<Object>} ES: Datos del usuario y tokens. EN: User details and tokens.
   */
  async execute({ email, password, passphrase, tenantId }) {
    // ES: Obtener administrador correspondiente de la base de datos.
    // EN: Fetch matching administrator from database.
    const admin = await this.adminRepository.findByEmail(email, tenantId);
    if (!admin) {
      throw new Error('Invalid email, password or passphrase / Correo, contraseña o frase de seguridad inválidos');
    }

    // ES: Verificar coincidencia del Hash de contraseña.
    // EN: Verify password Hash match.
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      throw new Error('Invalid email, password or passphrase / Correo, contraseña o frase de seguridad inválidos');
    }

    // ES: Verificar coincidencia del Hash de la frase de seguridad.
    // EN: Verify passphrase Hash match.
    if (!admin.passphrase) {
      throw new Error('Passphrase not configured / Frase de seguridad no configurada');
    }
    const isPassphraseMatch = await bcrypt.compare(passphrase, admin.passphrase);
    if (!isPassphraseMatch) {
      throw new Error('Invalid email, password or passphrase / Correo, contraseña o frase de seguridad inválidos');
    }

    // ES: Construir payload y firmar tokens.
    // EN: Build payload and sign tokens.
    const payload = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      tenantId: tenantId || null,
    };

    const accessToken = this.tokenService.signAccessToken(payload);
    const refreshToken = this.tokenService.signRefreshToken(payload);

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      accessToken,
      refreshToken,
    };
  }
}
