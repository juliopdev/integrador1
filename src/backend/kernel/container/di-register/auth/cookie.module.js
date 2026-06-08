import { asClass } from 'awilix';

/**
 * ES: Servicio ligero para el parseo y serialización de cookies en cabeceras HTTP.
 * EN: Lightweight service to parse and serialize cookies in HTTP headers.
 */
export class CookieService {
  /**
   * ES: Parsea una cadena de texto de cabecera 'Cookie' a un diccionario clave-valor.
   * EN: Parses a raw 'Cookie' header string into a key-value dictionary.
   * 
   * @param {string} cookieHeader 
   * @returns {Object}
   */
  parse(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      if (parts.length > 1) {
        cookies[parts[0].trim()] = parts[1].trim();
      }
    });
    return cookies;
  }

  /**
   * ES: Serializa un nombre y valor en una cadena de configuración de cookie.
   * EN: Serializes a name and value into a cookie setting string.
   * 
   * @param {string} name 
   * @param {string} value 
   * @param {Object} [options] 
   * @param {boolean} [options.httpOnly] 
   * @param {boolean} [options.secure] 
   * @param {string} [options.path] 
   * @param {number} [options.maxAge] 
   * @param {string} [options.sameSite] 
   * @returns {string}
   */
  serialize(name, value, options = {}) {
    let str = `${name}=${value}`;
    if (options.httpOnly) str += '; HttpOnly';
    if (options.secure) str += '; Secure';
    if (options.path) str += `; Path=${options.path}`;
    if (options.maxAge) str += `; Max-Age=${options.maxAge}`;
    if (options.sameSite) str += `; SameSite=${options.sameSite}`;
    return str;
  }
}

/**
 * ES: Registra el servicio de cookies en el contenedor IoC.
 * EN: Registers the cookie service in the IoC container.
 * 
 * @param {import('awilix').AwilixContainer} container 
 */
export function registerCookieModule(container) {
  container.register({
    cookieService: asClass(CookieService).singleton(),
  });
}
