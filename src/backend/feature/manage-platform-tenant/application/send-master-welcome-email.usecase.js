import { renderMailTemplate } from '../../../common/templates/render.js';

/**
 * Fábrica para el caso de uso que envía el correo electrónico de bienvenida al Master del tenant.
 * Construye la URL de activación dinámica con el subdominio del tenant e inyecta la plantilla.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {Object} deps.mailer - Proveedor de correo electrónico.
 * @param {Function} deps.mailer.sendMail - Método de envío de correo.
 * @param {string} deps.appBaseUrl - URL base pública de la plataforma.
 * @returns {(params: { email: string, subdomain: string, rawToken: string }) => Promise<{ url: string }>}
 */
export function makeSendMasterWelcomeEmail({ mailer, appBaseUrl }) {
  /**
   * Envía el correo de bienvenida al Master con el enlace de activación.
   * @param {Object} params - Parámetros del envío.
   * @param {string} params.email - Correo destino del Master.
   * @param {string} params.subdomain - Subdominio del tenant (para la URL).
   * @param {string} params.rawToken - Token de activación en crudo.
   * @returns {Promise<{ url: string }>} URL de activación generada.
   */
  return async function sendMasterWelcomeEmail({ email, subdomain, rawToken }) {
    const url = activationUrl(appBaseUrl, subdomain, rawToken);
    const html = await renderMailTemplate('new-admin', { url });
    await mailer.sendMail({
      to: email,
      subject: 'Activa tu cuenta de administrador',
      html,
    });
    return { url };
  };
}

/**
 * Construye la URL de activación insertando el subdominio del tenant en el host de APP_URL
 * (sirve en dev `*.localhost` y en prod).
 * @param {string} appBaseUrl - URL base de la plataforma.
 * @param {string} subdomain - Subdominio del tenant.
 * @param {string} rawToken - Token de activación en crudo.
 * @returns {string} URL completa de activación.
 * @example
 * activationUrl('https://app.example.com', 'mitenant', 'abc123')
 * // 'https://mitenant.app.example.com/dashboard/login?tk=abc123'
 */
function activationUrl(appBaseUrl, subdomain, rawToken) {
  const url = new URL(appBaseUrl);
  url.hostname = `${subdomain}.${url.hostname}`;
  url.pathname = '/dashboard/login';
  url.searchParams.set('tk', rawToken);
  return url.toString();
}
