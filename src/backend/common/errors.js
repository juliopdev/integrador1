/**
 * Módulo de errores de dominio de la aplicación.
 * Define una jerarquía de clases de error con código HTTP y código de negocio en SNAKE_CASE.
 * Los casos de uso lanzan estas excepciones y el manejador global de errores las mapea
 * a respuestas JSON uniformes. La clase base es {@link AppError}.
 *
 * @module errors
 */

// Errores de aplicación con código HTTP + código de negocio (SNAKE_CASE).
// Los casos de uso lanzan estas excepciones; el manejador global las mapea. Ver .doc/rules/errors.md.

/**
 * Clase base para errores operativos de la aplicación.
 * @class
 * @extends Error
 */
export class AppError extends Error {
  /**
   * @param {number} statusCode - Código de estado HTTP (ej. 400, 404, 500).
   * @param {string} code - Código de negocio en SNAKE_CASE (ej. INVALID_CREDENTIALS).
   * @param {string} message - Mensaje descriptivo del error para el usuario.
   */
  constructor(statusCode, code, message) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    /** @type {boolean} Indica que el error es controlado/operativo en la aplicación. */
    this.isOperational = true;
  }
}

/**
 * Error de dominio que representa una regla de negocio rota (HTTP 422).
 * Ej: correo duplicado, token expirado.
 * @class
 * @extends AppError
 */
export class DomainError extends AppError {
  /**
   * @param {string} code - Código de negocio en SNAKE_CASE.
   * @param {string} message - Mensaje descriptivo del error.
   */
  constructor(code, message) {
    super(422, code, message);
  }
}

/**
 * Error para recursos no encontrados (HTTP 404).
 * @class
 * @extends AppError
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} code - Código de negocio en SNAKE_CASE.
   * @param {string} message - Mensaje descriptivo del error.
   */
  constructor(code, message) {
    super(404, code, message);
  }
}

/**
 * Error para fallas de autenticación o credenciales inválidas (HTTP 401).
 * @class
 * @extends AppError
 */
export class AuthError extends AppError {
  /**
   * @param {string} code - Código de negocio en SNAKE_CASE.
   * @param {string} message - Mensaje descriptivo del error.
   */
  constructor(code, message) {
    super(401, code, message);
  }
}

/**
 * Error para usuarios autenticados que no tienen permisos suficientes (HTTP 403).
 * @class
 * @extends AppError
 */
export class ForbiddenError extends AppError {
  /**
   * @param {string} code - Código de negocio en SNAKE_CASE.
   * @param {string} message - Mensaje descriptivo del error.
   */
  constructor(code, message) {
    super(403, code, message);
  }
}
