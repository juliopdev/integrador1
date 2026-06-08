import jwt from 'jsonwebtoken';
import { asClass } from 'awilix';

/**
 * ES: Servicio encargado de la generación y validación de tokens JWT.
 * EN: Service in charge of JWT token generation and validation.
 */
export class TokenService {
  /**
   * @param {Object} cradle 
   * @param {Object} cradle.env
   */
  constructor({ env }) {
    this.secret = env.JWT_SECRET;
  }

  /**
   * ES: Genera un token de acceso de corta duración (15 minutos).
   * EN: Generates a short-lived access token (15 minutes).
   * 
   * @param {Object} payload 
   * @returns {string}
   */
  signAccessToken(payload) {
    return jwt.sign(payload, this.secret, { expiresIn: '15m' });
  }

  /**
   * ES: Genera un token de refresco de larga duración (7 días).
   * EN: Generates a long-lived refresh token (7 days).
   * 
   * @param {Object} payload 
   * @returns {string}
   */
  signRefreshToken(payload) {
    return jwt.sign(payload, this.secret, { expiresIn: '7d' });
  }

  /**
   * ES: Valida e interpreta la información de un token JWT.
   * EN: Validates and decodes the claims of a JWT token.
   * 
   * @param {string} token 
   * @returns {Object} ES: Payload descodificado. EN: Decoded payload.
   */
  verifyToken(token) {
    return jwt.verify(token, this.secret);
  }
}

/**
 * ES: Registra el servicio de tokens en el contenedor IoC.
 * EN: Registers the token service in the IoC container.
 * 
 * @param {import('awilix').AwilixContainer} container 
 */
export function registerJwtModule(container) {
  container.register({
    tokenService: asClass(TokenService).singleton(),
  });
}
