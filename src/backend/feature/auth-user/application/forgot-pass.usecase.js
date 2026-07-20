import { uuidv7 } from '../../../common/id.js';
import { generateToken } from '../../../common/token.js';
import { renderMailTemplate } from '../../../common/templates/render.js';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora — más corto que invitación porque el user ya existe

/**
 * Fábrica para el caso de uso que procesa la solicitud de restablecimiento de contraseña de un usuario final (end-user).
 * Genera un token de un solo uso, lo guarda persistido en base de datos de forma hasheada y envía el enlace
 * a través del **mail provider del tenant** (`infrastructure/providers/tenant-mail.adapter.js`).
 *
 * P8.4: los end users NUNCA reciben correos con dominio de la plataforma (`juliopariona.com`).
 * Si el tenant no tiene mail provider linkeado, el flujo es silencioso — mismo shape que la
 * respuesta anti-enumeración (`user no existe`). Ver `.doc/rules/security.md`.
 *
 * @param {Object} deps - Dependencias de recuperación de contraseña.
 * @param {Object} deps.userRepository - Repositorio de usuarios del tenant space.
 * @param {(args: { to: string, subject: string, html: string }) => Promise<{ id: string|null, sent: boolean }>} deps.sendUserMail
 *   Función per-request que envía por el mail provider del tenant. Retorna `{ sent: false }` si
 *   no hay provider linkeado (silencio deliberado — no filtra estado de configuración al caller).
 * @param {string} deps.appBaseUrl - URL base pública de la plataforma.
 * @param {string} deps.subdomain - Subdominio del tenant space.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @param {number} [deps.ttlMs] - Tiempo de vida del token de restablecimiento en ms.
 * @returns {(params: { email: string }) => Promise<{ rawToken?: string }>} Función de caso de uso.
 */
export function makeForgotPass({ userRepository, sendUserMail, appBaseUrl, subdomain, now = () => Date.now(), ttlMs = RESET_TTL_MS }) {
  /**
   * Procesa la solicitud de restablecimiento de contraseña de un end-user.
   * Implementa anti-enumeración: responde vacío si el usuario no existe o no está activo,
   * y es silencioso si el tenant no tiene mail provider configurado.
   * @param {Object} params - Parámetros de entrada.
   * @param {string} params.email - Correo del usuario a recuperar.
   * @returns {Promise<{ rawToken?: string }>} Objeto con el token crudo (solo expuesto en tests).
   */
  return async function forgotPass({ email }) {
    const normalized = String(email ?? '').trim().toLowerCase();
    const user = userRepository.findByEmail(normalized);
    if (!user || user.status !== 'active') {
      return {}; // silencioso — anti-enumeración
    }

    const ts = now();
    const { raw, hash } = generateToken();
    userRepository.insertPasswordResetToken({
      id: uuidv7(),
      userId: user.id,
      tokenHash: hash,
      expiresAt: ts + ttlMs,
      now: ts,
    });

    const url = resetUrl(appBaseUrl, subdomain, raw);
    const html = await renderMailTemplate('reset-password', { url });
    // `sendUserMail` es silencioso si el tenant no tiene mail provider linkeado, O si el Master
    // apagó el toggle `userAuth` — mantiene la misma "silhouette" que el flujo de `user no existe`
    // (no filtra si el tenant configuró mail ni si tiene el toggle activado).
    await sendUserMail({
      mailType: 'userAuth',
      to: normalized,
      subject: 'Recuperación de acceso',
      html,
    });

    return { rawToken: raw }; // el raw solo se expone en tests unitarios; el handler NO lo devuelve
  };
}

/**
 * Construye la URL de restablecimiento para el end-user, incluyendo subdominio del tenant
 * y el token crudo como query param `tk`.
 * @param {string} appBaseUrl - URL base de la aplicación.
 * @param {string} subdomain - Subdominio del tenant space.
 * @param {string} rawToken - Token crudo de restablecimiento.
 * @returns {string} URL absoluta de restablecimiento.
 * @example
 * resetUrl('https://app.example.com', 'shop', 'abc123')
 * // 'https://shop.app.example.com/reset-pass?tk=abc123'
 */
function resetUrl(appBaseUrl, subdomain, rawToken) {
  const url = new URL(appBaseUrl);
  url.hostname = `${subdomain}.${url.hostname}`;
  url.pathname = '/reset-pass';
  url.searchParams.set('tk', rawToken);
  return url.toString();
}
