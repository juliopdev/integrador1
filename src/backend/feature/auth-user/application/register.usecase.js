import bcrypt from 'bcryptjs';

/**
 * ES: Caso de Uso para el registro de Usuarios Finales (Headless API).
 * Verifica si el registro de API está habilitado; de lo contrario, retorna un error 503.
 * 
 * EN: Use Case for End-User registration (Headless API).
 * Checks if API registration is enabled; otherwise, returns a 503 error.
 */
export class RegisterUserUseCase {
  /**
   * @param {Object} cradle 
   * @param {import('../infrastructure/user.repository').UserRepository} cradle.userRepository 
   * @param {import('../../../kernel/container/di-register/auth/jwt.module').TokenService} cradle.tokenService
   * @param {Object} cradle.tenant
   */
  constructor({ userRepository, tokenService, tenant }) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
    this.tenant = tenant;
  }

  /**
   * ES: Ejecuta el registro del nuevo usuario final.
   * EN: Runs the new end-user registration flow.
   * 
   * @param {Object} registrationData 
   * @param {string} registrationData.email 
   * @param {string} registrationData.password 
   * @returns {Promise<Object>}
   */
  async execute({ email, password }) {
    // ES: Comprobar el estado apiAuthEnabled del inquilino.
    // EN: Verify tenant apiAuthEnabled status.
    if (!this.tenant || this.tenant.apiAuthEnabled === 0) {
      const error = new Error('API registration is disabled for this tenant / Registro de API deshabilitado para este inquilino');
      error.statusCode = 503;
      throw error;
    }

    // ES: Verificar si el correo electrónico ya existe en el espacio del inquilino.
    // EN: Verify if email already exists in the tenant space.
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new Error('Email is already registered / El correo ya está registrado');
    }

    // ES: Cifrado Hash de contraseña.
    // EN: Hash password using bcrypt.
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ES: Registrar usuario final en base de datos.
    // EN: Write end-user into database.
    const user = await this.userRepository.create({
      email,
      password: hashedPassword,
      role: 'user',
      status: 'active',
    });

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
