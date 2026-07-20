import { asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { tenants, plans, memberships, tenantStatusEvents } from '../../../config/drizzle/schema-platform.js';

/**
 * @typedef {Object} TenantRepository
 * @property {function(string): (Object|null)} findBySubdomain - Busca un tenant por su subdominio (incluyendo eliminados lógicamente).
 * @property {function(string): (Object|null)} findById - Busca un tenant activo por su identificador.
 * @property {function(): Array<Object>} findAll - Obtiene todos los tenants activos (no eliminados).
 * @property {function(Object): void} insertTenant - Inserta un nuevo tenant en la base de datos de plataforma.
 * @property {function(): Array<Object>} listPlans - Obtiene el catálogo completo de planes ordenado cronológicamente.
 * @property {function(string): (Object|null)} findPlanById - Busca un plan por su identificador único.
 * @property {function(string): (Object|null)} findPlanByName - Busca un plan por su nombre único (basic/standard/premium).
 * @property {function(Object): void} insertMembership - Registra un nuevo contrato de membresía de plan para un tenant.
 * @property {function(string): (Object|null)} findMembershipByTenant - Obtiene el contrato/membresía activo más reciente de un tenant.
 * @property {function(Object): void} insertStatusEvent - Inserta un evento de habilitación en el histórico de estados del tenant.
 * @property {function(string): Array<Object>} listStatusEvents - Obtiene la bitácora de eventos de estado de un tenant cronológicamente.
 * @property {function(Object): void} updateStatus - Cambia el estado de un tenant (ej. a active o suspended).
 * @property {function(Object): void} softDelete - Registra la eliminación lógica de un tenant seteando deletedAt.
 * @property {function(Object): void} updateProjectName - Actualiza el nombre visible del proyecto del tenant.
 */

/**
 * Fábrica para el repositorio de persistencia de tenants de plataforma.
 * Centraliza las consultas Drizzle de lectura/escritura en `platform.db`.
 *
 * @param {Object} deps - Dependencias de base de datos.
 * @param {Object} deps.db - Instancia de Drizzle conectada a `platform.db`.
 * @returns {TenantRepository}
 */
export function createTenantRepository({ db }) {
  return {
    /**
     * Busca un tenant por su subdominio (incluye soft-deleted: el subdominio sigue reservado).
     * @param {string} subdomain - Subdominio a buscar.
     * @returns {Object|null} Datos del tenant o `null` si no existe.
     */
    findBySubdomain(subdomain) {
      const rows = db.select().from(tenants).where(eq(tenants.subdomain, subdomain)).limit(1).all();
      return rows[0] ?? null;
    },

    /**
     * Busca un tenant activo (no eliminado) por su ID.
     * @param {string} id - ID del tenant.
     * @returns {Object|null} Datos del tenant o `null` si no existe o fue eliminado.
     */
    findById(id) {
      const rows = db
        .select()
        .from(tenants)
        .where(eq(tenants.id, id))
        .limit(1)
        .all();
      const tenant = rows[0] ?? null;
      return tenant && tenant.deletedAt === null ? tenant : null;
    },

    /**
     * Lista todos los tenants no eliminados (activos).
     * @returns {Array<Object>} Lista de tenants activos.
     */
    findAll() {
      return db.select().from(tenants).where(isNull(tenants.deletedAt)).all();
    },

    /**
     * Lista tenants con membresía, plan y eventos de estado en una sola query (anti-N+1).
     * Agrupa las filas planas del JOIN en objetos anidados por tenant.
     * @returns {Array<Object>} Lista de tenants con datos enriquecidos (membership, plan, statusEvents).
     */
    findAllEnriched() {
      const rows = db
        .select({
          tenantId: tenants.id,
          subdomain: tenants.subdomain,
          projectName: tenants.projectName,
          status: tenants.status,
          createdAt: tenants.createdAt,
          updatedAt: tenants.updatedAt,
          membershipId: memberships.id,
          membershipStartsAt: memberships.startsAt,
          membershipEndsAt: memberships.endsAt,
          planId: plans.id,
          planName: plans.name,
          planLabel: plans.label,
          planDescription: plans.description,
          planFeaturesJson: plans.featuresJson,
          eventId: tenantStatusEvents.id,
          eventEvent: tenantStatusEvents.event,
          eventCreatedAt: tenantStatusEvents.createdAt,
        })
        .from(tenants)
        .leftJoin(memberships, eq(memberships.tenantId, tenants.id))
        .leftJoin(plans, eq(plans.id, memberships.planId))
        .leftJoin(tenantStatusEvents, eq(tenantStatusEvents.tenantId, tenants.id))
        .where(isNull(tenants.deletedAt))
        .orderBy(asc(tenants.createdAt), asc(tenantStatusEvents.createdAt))
        .all();

      // Agregar filas planas en tenantos anidados.
      const tenantMap = new Map();
      for (const row of rows) {
        if (!tenantMap.has(row.tenantId)) {
          tenantMap.set(row.tenantId, {
            id: row.tenantId,
            subdomain: row.subdomain,
            projectName: row.projectName,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            membership: row.membershipId
              ? { startsAt: row.membershipStartsAt, endsAt: row.membershipEndsAt }
              : null,
            plan: row.planId
              ? { name: row.planName, label: row.planLabel, description: row.planDescription, features: {} }
              : null,
            statusEvents: [],
          });
          // Parse featuresJson una sola vez por plan.
          if (row.planId) {
            try { tenantMap.get(row.tenantId).plan.features = JSON.parse(row.planFeaturesJson); } catch { /* referencial */ }
          }
        }
        if (row.eventId) {
          tenantMap.get(row.tenantId).statusEvents.push({ id: row.eventId, event: row.eventEvent, createdAt: row.eventCreatedAt });
        }
      }
      return [...tenantMap.values()];
    },

    /**
     * Inserta un nuevo tenant en la base de datos de plataforma.
     * La unicidad de `subdomain` la respalda la restricción UNIQUE.
     * @param {Object} params - Datos del tenant.
     * @param {string} params.id - ID único del tenant.
     * @param {string} params.subdomain - Subdominio del tenant.
     * @param {string|null} [params.projectName=null] - Nombre visible del proyecto.
     * @param {string} params.status - Estado inicial del tenant.
     * @param {number} params.now - Timestamp de creación (ms).
     */
    insertTenant({ id, subdomain, projectName = null, status, now }) {
      db.insert(tenants).values({ id, subdomain, projectName, status, createdAt: now, updatedAt: now }).run();
    },

    // ── Planes / contrato (PLAN-ux2 P2) ─────────────────────────────────

    /**
     * Obtiene el catálogo completo de planes disponibles (referencial, sembrado en la migración).
     * @returns {Array<Object>} Lista de planes ordenada cronológicamente.
     */
    listPlans() {
      return db.select().from(plans).orderBy(asc(plans.createdAt)).all();
    },

    /**
     * Busca un plan por su identificador único.
     * @param {string} id - ID del plan.
     * @returns {Object|null} Datos del plan o `null` si no existe.
     */
    findPlanById(id) {
      const rows = db.select().from(plans).where(eq(plans.id, id)).limit(1).all();
      return rows[0] ?? null;
    },

    /**
     * Busca un plan por su nombre único (`basic`/`standard`/`premium`).
     * @param {string} name - Nombre del plan.
     * @returns {Object|null} Datos del plan o `null` si no existe.
     */
    findPlanByName(name) {
      const rows = db.select().from(plans).where(eq(plans.name, name)).limit(1).all();
      return rows[0] ?? null;
    },

    /**
     * Inserta un contrato de membresía para un tenant (una fila por alta; `endsAt` NULL = permanente).
     * @param {Object} params - Datos de la membresía.
     * @param {string} params.id - ID único de la membresía.
     * @param {string} params.tenantId - ID del tenant.
     * @param {string} params.planId - ID del plan asociado.
     * @param {number} params.startsAt - Timestamp de inicio (ms).
     * @param {number|null} [params.endsAt=null] - Timestamp de fin (ms) o `null` si es permanente.
     * @param {number} params.now - Timestamp de creación (ms).
     */
    insertMembership({ id, tenantId, planId, startsAt, endsAt = null, now }) {
      db.insert(memberships)
        .values({ id, tenantId, planId, startsAt, endsAt, createdAt: now, updatedAt: now })
        .run();
    },

    /**
     * Obtiene el contrato/membresía vigente más reciente del tenant.
     * @param {string} tenantId - ID del tenant.
     * @returns {Object|null} Membresía más reciente o `null` si no tiene.
     */
    findMembershipByTenant(tenantId) {
      const rows = db
        .select()
        .from(memberships)
        .where(eq(memberships.tenantId, tenantId))
        .orderBy(asc(memberships.createdAt))
        .all();
      return rows[rows.length - 1] ?? null;
    },

    // ── Histórico de estados (PLAN-ux2 P2) ──────────────────────────────

    /**
     * Registra un evento de estado del tenant (`created` | `enabled` | `disabled`).
     * @param {Object} params - Datos del evento.
     * @param {string} params.id - ID único del evento.
     * @param {string} params.tenantId - ID del tenant.
     * @param {string} params.event - Tipo de evento (`created`, `enabled`, `disabled`).
     * @param {number} params.now - Timestamp del evento (ms).
     */
    insertStatusEvent({ id, tenantId, event, now }) {
      db.insert(tenantStatusEvents).values({ id, tenantId, event, createdAt: now }).run();
    },

    /**
     * Obtiene la bitácora de eventos de estado del tenant en orden cronológico ascendente.
     * @param {string} tenantId - ID del tenant.
     * @returns {Array<Object>} Lista de eventos de estado.
     */
    listStatusEvents(tenantId) {
      return db
        .select()
        .from(tenantStatusEvents)
        .where(eq(tenantStatusEvents.tenantId, tenantId))
        .orderBy(asc(tenantStatusEvents.createdAt))
        .all();
    },

    /**
     * Cambia el estado de un tenant (pending → active, active ↔ suspended).
     * @param {Object} params - Parámetros de actualización.
     * @param {string} params.tenantId - ID del tenant.
     * @param {string} params.status - Nuevo estado del tenant.
     * @param {number} params.now - Timestamp de la operación (ms).
     */
    updateStatus({ tenantId, status, now }) {
      db.update(tenants).set({ status, updatedAt: now }).where(eq(tenants.id, tenantId)).run();
    },

    /**
     * Soft-delete de un tenant marcando su campo `deletedAt`.
     * @param {Object} params - Parámetros del borrado lógico.
     * @param {string} params.tenantId - ID del tenant.
     * @param {number} params.now - Timestamp de la operación (ms).
     */
    softDelete({ tenantId, now }) {
      db.update(tenants).set({ deletedAt: now, updatedAt: now }).where(eq(tenants.id, tenantId)).run();
    },

    /**
     * Actualiza el nombre visible del proyecto del tenant.
     * El subdominio es inmutable y no se modifica aquí.
     * @param {Object} params - Parámetros de actualización.
     * @param {string} params.tenantId - ID del tenant.
     * @param {string} params.projectName - Nuevo nombre del proyecto.
     * @param {number} params.now - Timestamp de la operación (ms).
     */
    updateProjectName({ tenantId, projectName, now }) {
      db.update(tenants).set({ projectName, updatedAt: now }).where(eq(tenants.id, tenantId)).run();
    },
  };
}
