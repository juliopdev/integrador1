import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Módulo de renderizado de templates EJS para correos.
 * Provee la función {@link renderMailTemplate} para compilar y renderizar plantillas
 * de correo electrónico ubicadas en el subdirectorio `mail/`.
 *
 * @module render
 */

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Renderiza una plantilla de correo EJS a HTML de manera asíncrona.
 * 
 * @param {string} name - Nombre de la plantilla (sin extensión .ejs).
 * @param {Object} data - Datos para inyectar en la plantilla.
 * @returns {Promise<string>} HTML renderizado de la plantilla.
 * @throws {Error} Si la plantilla no existe o ocurre un error de compilación EJS.
 * @example
 * const html = await renderMailTemplate('welcome', { userName: 'John' });
 * // html => '<!DOCTYPE html>...'
 */
export async function renderMailTemplate(name, data) {
  const filePath = join(here, 'mail', `${name}.ejs`);
  return ejs.renderFile(filePath, data);
}
