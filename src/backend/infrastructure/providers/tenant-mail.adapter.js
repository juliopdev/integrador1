import { and, eq } from 'drizzle-orm';
import { tenantProviders } from '../../config/drizzle/schema-tenant.js';
import { decrypt } from '../../common/crypto.js';
import { logger } from './logger.js';
import { AppError } from '../../common/errors.js';
import { findProvider } from './registry.js';

const ALLOWED_MAIL_TYPES = new Set(['userAuth', 'userSupport']);

/**
 * P8.4: Envío de correos a END USERS del tenant vía SU propio provider linkeado. Contract:
 *
 *   `sendUserMail({ tenantDb, mailType, to, subject, html }) → Promise<{ id, sent: boolean }>`
 *
 * Comportamiento por diseño (validado con el usuario 2026-07-19):
 *  - **NO fallback a platform mail**. Sin provider `mail` linkeado y enabled → `{ sent: false }`
 *    silencioso. Los end users nunca reciben correos con dominio `juliopariona.com`.
 *  - **Silencio explícito** matchea el patrón anti-enumeración de `forgot-pass`.
 *  - **P8.4b — Toggles granulares por tipo**: `settings.toggles[mailType]` gate el envío.
 *  - **P8.4c — Delegación al descriptor del registry**: `desc.send({ config, to, subject, html })`
 *    encapsula el "cómo" de cada provider (Resend SDK, Mailgun REST, SendGrid REST, ...). Agregar
 *    un provider nuevo NO requiere tocar este archivo — solo agregar la entrada al registry con
 *    su `send` method.
 *
 * `mailType` OBLIGATORIO — obliga al caller a categorizar. Un `mailType` desconocido lanza
 * error (fail-closed) — mejor romper temprano que enviar un correo mal-categorizado.
 *
 * @param {{ tenantDb: object, mailType: string, to: string, subject: string, html: string }} params - Parámetros del envío.
 * @param {object} params.tenantDb - Conexión Drizzle a la base de datos del tenant.
 * @param {string} params.mailType - Tipo de correo ('userAuth' | 'userSupport').
 * @param {string} params.to - Email de destino del end user.
 * @param {string} params.subject - Asunto del correo.
 * @param {string} params.html - Cuerpo HTML del correo.
 * @returns {Promise<{ id: string|null, sent: boolean }>} Resultado del envío.
 * @throws {AppError} Si el `mailType` es inválido (500) o el envío del provider falla (502).
 */
export async function sendUserMail({ tenantDb, mailType, to, subject, html }) {
  if (!ALLOWED_MAIL_TYPES.has(mailType)) {
    throw new AppError(500, 'INVALID_MAIL_TYPE', `mailType desconocido: ${mailType}. Aceptados: ${[...ALLOWED_MAIL_TYPES].join(', ')}`);
  }

  const row = tenantDb
    .select({
      provider: tenantProviders.provider,
      configValuesJson: tenantProviders.configValuesJson,
      settingsJson: tenantProviders.settingsJson,
    })
    .from(tenantProviders)
    .where(and(eq(tenantProviders.category, 'mail'), eq(tenantProviders.enabled, 1)))
    .limit(1)
    .all()[0];

  if (!row) {
    logger.debug({ to, subject, mailType }, '[tenant-mail] sin provider linkeado — silencio deliberado');
    return { id: null, sent: false };
  }

  // Gate por toggle. Sin `settingsJson` o toggle explícitamente falso → silencio.
  const settings = parseSettings(row.settingsJson);
  if (settings.toggles?.[mailType] !== true) {
    logger.debug({ to, subject, mailType }, '[tenant-mail] toggle desactivado por el Master — silencio');
    return { id: null, sent: false };
  }

  const desc = findProvider({ category: 'mail', provider: row.provider });
  if (!desc || !desc.operable || typeof desc.send !== 'function') {
    logger.warn({ provider: row.provider }, '[tenant-mail] provider no operable o sin send() — silencio');
    return { id: null, sent: false };
  }

  let config;
  try {
    config = JSON.parse(decrypt(JSON.parse(row.configValuesJson)));
  } catch (err) {
    logger.error({ err, provider: row.provider }, '[tenant-mail] no se pudo desencriptar config; silencio');
    return { id: null, sent: false };
  }

  const result = await desc.send({ config, to, subject, html });
  if (!result?.ok) {
    // Errores del provider = config del Master rota (dominio no verificado, apiKey inválida, quota).
    // Se propaga como 502 — no es bug de plataforma.
    throw new AppError(502, 'TENANT_EMAIL_SEND_FAILED', `Tenant mail (${row.provider}) error: ${result?.error || 'unknown'}`);
  }
  return { id: result.id ?? `${row.provider}-sent`, sent: true };
}

function parseSettings(json) {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}
