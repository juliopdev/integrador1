import { DomainError } from '../../../common/errors.js';
import { uuidv7 } from '../../../common/id.js';

/**
 * Suma meses calendario a un timestamp ms (respeta días variables). Ej: 31-ene + 1 mes = 28/29-feb.
 * Se usa para calcular `endsAt` del membership a partir de `plan.features.deployMonths`.
 * @param {number} startMs - Timestamp inicial en ms.
 * @param {number} months - Cantidad de meses a sumar.
 * @returns {number} Nuevo timestamp en ms.
 * @example
 * addMonths(new Date('2025-01-31').getTime(), 1) // 28 o 29 de febrero de 2025
 */
function addMonths(startMs, months) {
  const d = new Date(startMs);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

/**
 * Fábrica para el caso de uso que orquesta el alta completa de un tenant en la plataforma.
 * Valida y reserva el subdominio, asocia un plan, provisiona la base de datos física, registra
 * al Master, envía el correo de bienvenida y activa el tenant.
 *
 * P8 (UX): la vigencia del contrato se DERIVA del plan (`features.deployMonths`), no se pide
 * al Superadmin. `deployMonths === null` → contrato permanente (Premium); número → `endsAt` es
 * `startsAt + N meses`.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {(params: { subdomain: string, projectName?: string }) => Promise<{ tenantId: string, subdomain: string }>} deps.validateAndBindSubdomain
 *   - Caso de uso de validación y reserva de subdominio.
 * @param {(params: { tenantId: string }) => Promise<{ tenantId: string, dbPath: string }>} deps.provisionTenantDb
 *   - Caso de uso de provisión de base de datos.
 * @param {(tenantId: string) => (params: { email: string }) => Promise<{ rawToken: string }>} deps.registerMasterFor
 *   - Factory per-tenant para registrar al Master.
 * @param {(params: { email: string, subdomain: string, rawToken: string }) => Promise<{ url: string }>} deps.sendWelcome
 *   - Caso de uso de envío de correo de bienvenida.
 * @param {Object} deps.tenantRepository - Repositorio de tenants de plataforma.
 * @param {() => number} [deps.now] - Generador opcional de timestamps (ms).
 * @returns {(params: { subdomain: string, masterEmail: string, projectName?: string, planId?: string }) =>
 *   Promise<{ tenantId: string, subdomain: string }>}
 * @throws {DomainError} `PLAN_NOT_FOUND` — si el `planId` indicado no existe.
 */
export function makeProvisionNewTenant({
  validateAndBindSubdomain,
  provisionTenantDb,
  registerMasterFor,
  sendWelcome,
  tenantRepository,
  now = () => Date.now(),
}) {
  /**
   * Ejecuta el flujo completo de alta de un tenant.
   * @param {Object} params - Parámetros del alta.
   * @param {string} params.subdomain - Subdominio deseado.
   * @param {string} params.masterEmail - Correo del Master.
   * @param {string} [params.projectName] - Nombre visible del proyecto.
   * @param {string} [params.planId] - ID del plan (default: `basic`).
   * @returns {Promise<{ tenantId: string, subdomain: string }>}
   * @throws {DomainError} `PLAN_NOT_FOUND`
   */
  return async function provisionNewTenant({ subdomain, masterEmail, projectName, planId }) {
    // 1. Resolver el plan (referencial). Con `planId` debe existir; sin él cae a `basic`.
    const plan = planId
      ? tenantRepository.findPlanById(planId)
      : tenantRepository.findPlanByName('basic');
    if (planId && !plan) {
      throw new DomainError('PLAN_NOT_FOUND', 'El plan seleccionado no existe.');
    }

    // 2. Reservar subdominio (platform.db) — lanza DomainError si inválido/reservado/tomado.
    const { tenantId, subdomain: resolved } = await validateAndBindSubdomain({
      subdomain,
      projectName,
    });

    // 3. Contrato del tenant — `endsAt` derivado del plan: null = permanente.
    if (plan) {
      const startsAt = now();
      let deployMonths = null;
      try {
        const features = JSON.parse(plan.featuresJson || '{}');
        deployMonths = features.deployMonths ?? null;
      } catch {
        // Plan corrupto: tratamos como permanente y logueamos vía el propio use case caller.
      }
      const endsAt = deployMonths != null ? addMonths(startsAt, deployMonths) : null;
      tenantRepository.insertMembership({
        id: uuidv7(), tenantId, planId: plan.id, startsAt, endsAt, now: startsAt,
      });
    }

    // 4. Crear físicamente el tenant.db + esquema base.
    await provisionTenantDb({ tenantId });

    // 5. Registrar al Master dentro de su tenant.db (devuelve el token crudo de activación).
    const { rawToken } = await registerMasterFor(tenantId)({ email: masterEmail });

    // 6. Enviar el correo de bienvenida con el enlace de activación.
    await sendWelcome({ email: masterEmail, subdomain: resolved, rawToken });

    // 7. Activar el tenant.
    const activatedAt = now();
    tenantRepository.updateStatus({ tenantId, status: 'active', now: activatedAt });
    tenantRepository.insertStatusEvent({ id: uuidv7(), tenantId, event: 'enabled', now: activatedAt });

    return { tenantId, subdomain: resolved };
  };
}
