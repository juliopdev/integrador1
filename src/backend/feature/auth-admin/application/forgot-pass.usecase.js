import { uuidv7 } from '../../../common/id.js';
import { generateToken } from '../../../common/token.js';
import { renderMailTemplate } from '../../../common/templates/render.js';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora — coherente con auth-user.slice4

/**
 * Fábrica para el caso de uso que solicita el restablecimiento de la contraseña para administradores (Superadmin / Master / Staff).
 * Implementa medidas de anti-enumeración de cuentas respondiendo de forma silenciosa y vacía si el correo no existe o no está activo.
 *
 * @param {Object} deps - Dependencias de recuperación.
 * @param {Object} deps.adminRepository - Repositorio de administradores.
 * @param {Object} deps.mailer - Servicio de envío de correos.
 * @param {function(Object): Promise<void>} deps.mailer.sendMail - Método para despachar correos electrónicos.
 * @param {string} deps.appBaseUrl - URL pública de acceso a la plataforma.
 * @param {string|null} deps.subdomain - Subdominio del tenant si aplica, o null si es plataforma global (Superadmin).
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @param {number} [deps.ttlMs] - Tiempo de vida del token de restablecimiento.
 * @returns {(input: { email: string }) => Promise<{ rawToken?: string }>} Función de caso de uso.
 * @example
 * const forgotPass = makeAdminForgotPass({ adminRepository, mailer, appBaseUrl: 'https://app.example.com', subdomain: 'tenant-a' });
 * const result = await forgotPass({ email: 'admin@example.com' });
 * // result.rawToken solo se expone en tests unitarios
 */
export function makeAdminForgotPass({ adminRepository, mailer, appBaseUrl, subdomain, now = () => Date.now(), ttlMs = RESET_TTL_MS }) {
  /**
   * Procesa la solicitud de restablecimiento de contraseña de un administrador.
   * Busca al usuario por email, genera un token de un solo uso, lo persiste hasheado
   * y envía el enlace de recuperación por correo.
   * @param {Object} input - Parámetros de entrada.
   * @param {string} input.email - Correo del administrador a recuperar.
   * @returns {Promise<{ rawToken?: string }>} Objeto con el token crudo (solo expuesto en tests unitarios).
   */
  return async function forgotPass({ email }) {
    const normalized = String(email ?? '').trim().toLowerCase();
    const user = adminRepository.findByEmail(normalized);
    if (!user || !adminRepository.isActive(user)) {
      return {}; // silencioso — anti-enumeración
    }

    const ts = now();
    const { raw, hash } = generateToken();
    adminRepository.insertPasswordResetToken({
      id: uuidv7(),
      userId: user.id,
      tokenHash: hash,
      expiresAt: ts + ttlMs,
      now: ts,
    });

    const url = resetUrl(appBaseUrl, subdomain, raw);
    const html = await renderMailTemplate('reset-password', { url });
    await mailer.sendMail({
      to: normalized,
      subject: 'Recuperación de acceso al panel',
      html,
    });

    return { rawToken: raw }; // solo tests unitarios inspeccionan esto; el handler NO lo devuelve
  };
}

/**
 * Construye la URL de restablecimiento para el correo electrónico, incorporando subdominio
 * y el token crudo como query param `tk`.
 * @param {string} appBaseUrl - URL base de la aplicación.
 * @param {string|null} subdomain - Subdominio del tenant o null para apex.
 * @param {string} rawToken - Token crudo de restablecimiento.
 * @returns {string} URL absoluta de restablecimiento.
 * @example
 * resetUrl('https://app.example.com', 'tenant-a', 'abc123')
 * // 'https://tenant-a.app.example.com/dashboard/reset-pass?tk=abc123'
 */
function resetUrl(appBaseUrl, subdomain, rawToken) {
  const url = new URL(appBaseUrl);
  if (subdomain) url.hostname = `${subdomain}.${url.hostname}`;
  url.pathname = '/dashboard/reset-pass';
  url.searchParams.set('tk', rawToken);
  return url.toString();
}
