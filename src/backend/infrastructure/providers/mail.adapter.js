import { env } from '../../config/env.js';
import { logger } from './logger.js';
import { AppError } from '../../common/errors.js';

// Adaptador de correo. Tres modos según el entorno + la API key:
//  - `NODE_ENV=test`: no-op silencioso (`{ id: 'test-noop' }`). Los tests que necesitan enviar
//    correo real inyectan su propio mailer.
//  - `API_KEY_RESEND` es placeholder (`re_XXX_XXX`) o vacío: log a consola sin gasto de cuota.
//  - Producción con key válida: `Resend` SDK — envío real.
//
// La firma `sendMail({ to, subject, html })` no cambia entre modos: el llamador la usa igual.

const isPlaceholderKey = (k) => !k || /^re_XXX/i.test(k);

let resendClient = null;
async function getResend() {
  if (resendClient) return resendClient;
  const { Resend } = await import('resend');
  resendClient = new Resend(env.API_KEY_RESEND);
  return resendClient;
}

/**
 * Envía un correo electrónico adaptándose al entorno de ejecución (mock en test, consola en dev con placeholder API, o real vía Resend en prod).
 * 
 * @param {Object} params - Parámetros del mensaje a enviar.
 * @param {string} params.to - Email de destino.
 * @param {string} params.subject - Asunto del correo.
 * @param {string} params.html - Contenido del cuerpo del mensaje en formato HTML.
 * @returns {Promise<{ id: string }>} Objeto que contiene el identificador único del correo enviado.
 * @throws {AppError} Si ocurre un fallo durante la comunicación con la API de Resend en producción.
 */
export async function sendMail({ to, subject, html }) {
  if (env.NODE_ENV === 'test') return { id: 'test-noop' };

  if (isPlaceholderKey(env.API_KEY_RESEND)) {
    logger.info({ to, subject, from: env.MAIL_FROM }, '[mail] simulado — API_KEY_RESEND es placeholder');
    return { id: 'mail-logged' };
  }

  const client = await getResend();
  const res = await client.emails.send({ from: env.MAIL_FROM, to, subject, html });
  if (res.error) {
    throw new AppError(502, 'EMAIL_SEND_FAILED', `Resend error: ${res.error.message || 'unknown'}`);
  }
  return { id: res.data?.id ?? 'resend-sent' };
}

function htmlToText(html) {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
