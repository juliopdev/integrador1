/**
 * ES: Caso de Uso para la renovación del token de acceso administrativo a partir de un refresh token.
 * EN: Use Case to renew the administrative access token using a refresh token.
 */
export class RefreshTokenAdminUseCase {
  /**
   * @param {Object} cradle 
   * @param {import('../../../kernel/container/di-register/auth/jwt.module').TokenService} cradle.tokenService 
   * @param {import('../infrastructure/admin.repository').AdminRepository} cradle.adminRepository
   */
  constructor({ tokenService, adminRepository }) {
    this.tokenService = tokenService;
    this.adminRepository = adminRepository;
  }

  /**
   * ES: Valida el refresh token y emite un nuevo token de acceso.
   * EN: Validates the refresh token and issues a new access token.
   * 
   * @param {string} refreshToken 
   * @returns {Promise<Object>}
   */
  async execute(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required / Se requiere token de refresco');
    }

    // ES: Verificar autenticidad y vigencia del token.
    // EN: Verify token authenticity and validity.
    const decoded = this.tokenService.verifyToken(refreshToken);

    // ES: Validar que la cuenta siga activa en la base de datos correspondiente.
    // EN: Validate that the account remains active in the respective database.
    const admin = await this.adminRepository.findByEmail(decoded.email, decoded.tenantId);
    if (!admin) {
      throw new Error('User not found / Usuario no encontrado');
    }

    // ES: Construir payload y firmar nuevo token.
    // EN: Build payload and sign new token.
    const payload = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      tenantId: decoded.tenantId,
    };

    const newAccessToken = this.tokenService.signAccessToken(payload);
    return { accessToken: newAccessToken };
  }
}
