import { uuidv7 } from '../../../common/id.js';
import { generateToken } from '../../../common/token.js';
import { DomainError } from '../../../common/errors.js';
import { renderMailTemplate } from '../../../common/templates/render.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

/**
 * El Master invita a un colaborador: valida que el rol exista y sea de categoría `staff`, crea el
 * usuario `invited` (sin contraseña), le asigna el rol, emite un token de **invitación** de un solo
 * uso y envía el enlace por correo. El Staff define luego su password+passphrase con el mismo flujo
 * de activación (token de invitación). Ver manage-master-staff.md y flows.md.
 *
 * @param {Object} deps - Dependencias del caso de uso.
 * @param {Object} deps.staffRepository - Repositorio de staff del tenant.
 * @param {Object} deps.mailer - Servicio de envío de correos.
 * @param {Function} deps.mailer.sendMail - Método para enviar correos electrónicos.
 * @param {string} deps.appBaseUrl - URL base de la plataforma.
 * @param {string} deps.subdomain - Subdominio del tenant.
 * @param {() => number} [deps.now] - Generador opcional de marcas de tiempo.
 * @param {number} [deps.ttlMs] - TTL del token de invitación en ms.
 * @returns {(params: { email: string, roleId: string }) => Promise<{ userId: string, rawToken?: string }>} Función de caso de uso.
 * @throws {DomainError} INVALID_ROLE - Si el rol no existe o no es de categoría staff.
 * @throws {DomainError} EMAIL_TAKEN - Si ya existe un usuario con ese correo en el tenant.
 */
export function makeInviteStaff({ staffRepository, mailer, appBaseUrl, subdomain, now = () => Date.now(), ttlMs = INVITE_TTL_MS }) {
  /**
   * Invita a un nuevo colaborador al tenant.
   * Valida el rol, crea el usuario en estado 'invited', le asigna el rol,
   * genera un token de invitación y envía el enlace por correo.
   * @param {Object} params - Datos de la invitación.
   * @param {string} params.email - Correo del colaborador a invitar.
   * @param {string} params.roleId - ID del rol staff a asignar.
   * @returns {Promise<{ userId: string, rawToken?: string }>} ID del colaborador y token crudo (solo tests).
   * @throws {DomainError} INVALID_ROLE - Si el rol no existe o no es asignable.
   * @throws {DomainError} EMAIL_TAKEN - Si el email ya está registrado.
   */
  return async function inviteStaff({ email, roleId }) {
    const role = staffRepository.findRoleById(roleId);
    if (!role || role.category !== 'staff') {
      throw new DomainError('INVALID_ROLE', 'El rol no existe o no es asignable a un colaborador.');
    }
    if (staffRepository.findUserByEmail(email)) {
      throw new DomainError('EMAIL_TAKEN', 'Ya existe un usuario con ese correo en este tenant.');
    }

    const ts = now();
    const userId = uuidv7();
    staffRepository.insertUser({ id: userId, email, status: 'invited', now: ts });
    staffRepository.assignRole({ userId, roleId, now: ts });

    const { raw, hash } = generateToken();
    staffRepository.insertInvitationToken({ id: uuidv7(), userId, tokenHash: hash, expiresAt: ts + ttlMs, now: ts });

    const url = invitationUrl(appBaseUrl, subdomain, raw);
    const html = await renderMailTemplate('staff-invitation', { url });
    await mailer.sendMail({
      to: email,
      subject: 'Te invitaron a colaborar',
      html,
    });

    return { userId, rawToken: raw };
  };
}

/**
 * Construye la URL de invitación para el correo, con subdominio y token crudo.
 * @param {string} appBaseUrl - URL base de la aplicación.
 * @param {string} subdomain - Subdominio del tenant.
 * @param {string} rawToken - Token crudo de invitación.
 * @returns {string} URL absoluta de activación.
 * @example
 * invitationUrl('https://app.example.com', 'shop', 'abc123')
 * // 'https://shop.app.example.com/dashboard/login?tk=abc123'
 */
function invitationUrl(appBaseUrl, subdomain, rawToken) {
  const url = new URL(appBaseUrl);
  url.hostname = `${subdomain}.${url.hostname}`;
  url.pathname = '/dashboard/login';
  url.searchParams.set('tk', rawToken);
  return url.toString();
}
