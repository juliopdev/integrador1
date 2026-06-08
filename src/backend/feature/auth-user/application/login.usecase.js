import bcrypt from 'bcryptjs';

/**
 * ES: Caso de Uso para inicio de sesión de Usuarios Finales del Inquilino (Headless API).
 * Verifica si el inquilino tiene habilitado el inicio de sesión de API; de lo contrario, arroja un error 503.
 * 
 * EN: Use Case for Tenant End-User login (Headless API).
 * Verifies if the tenant has enabled API login; otherwise, throws a 503 error.
 */
export class LoginUserUseCase {
  /**
   * @param {Object} cradle 
   * @param {import('../infrastructure/user.repository').UserRepository} cradle.userRepository 
   * @param {import('../../../kernel/container/di-register/auth/jwt.module').TokenService} cradle.tokenService
   * @param {Object} cradle.tenant - ES: Registro del inquilino inyectado en el scope. EN: Tenant record injected in request scope.
   */
  constructor({ userRepository, tokenService, tenant }) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
    this.tenant = tenant;
  }

  /**
   * ES: Ejecuta la validación de login de usuario final.
   * EN: Executes end-user login validation.
   * 
   * @param {Object} credentials 
   * @param {string} credentials.email 
   * @param {string} credentials.password 
   * @returns {Promise<Object>}
   */
  async execute({ email, password }) {
    // ES: Comprobar si el login de usuarios finales está habilitado (SQLite guarda 0 o 1).
    // EN: Verify if end-user login is enabled (SQLite stores 0 or 1).
    if (!this.tenant || this.tenant.apiAuthEnabled === 0) {
      const error = new Error('API authentication is disabled for this tenant / Autenticación de API deshabilitada para este inquilino');
      error.statusCode = 503;
      throw error;
    }

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password / Correo o contraseña inválidos');
    }

    if (user.status !== 'active') {
      const error = new Error('User is suspended / Usuario suspendido');
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error('Invalid email or password / Correo o contraseña inválidos');
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: this.tenant.id,
    };

    const accessToken = this.tokenService.signAccessToken(payload);
    const refreshToken = this.tokenService.signRefreshToken(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }
}
