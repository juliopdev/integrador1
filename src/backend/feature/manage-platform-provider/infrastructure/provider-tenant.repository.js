import { and, eq } from 'drizzle-orm';
import { uuidv7 } from '../../../common/id.js';
import { tenantProviders } from '../../../config/drizzle/schema-tenant.js';

/**
 * Fábrica para el repositorio de proveedores del tenant (`tenant_providers`): guarda la config
 * **cifrada** por `(category, provider)`. Recibe la conexión del tenant elegido.
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.db - Instancia de Drizzle conectada a la base SQLite del tenant.
 * @returns {{
 *   hasAny: () => boolean,
 *   findByCategory: (params: { category: string, provider: string }) => ({ configValuesJson: string }|null),
 *   list: () => Array<{ category: string, provider: string, enabled: number, settings: object }>,
 *   disable: (params: { category: string, provider: string, now: number }) => void,
 *   upsert: (params: { category: string, provider: string, configValuesJson: string, settingsJson?: string, now: number }) => void,
 *   updateSettings: (params: { category: string, provider: string, settingsJson: string, now: number }) => { updated: boolean },
 *   getSettings: (params: { category: string, provider: string }) => (object|null),
 *   snapshot: () => Array<{ category: string, provider: string, configValuesJson: string, enabled: number }>,
 *   restoreFromSnapshot: (snapshot: Array, now: number) => number,
 * }}
 */
export function createProviderRepository({ db }) {
  return {
    /**
     * Verifica si existe al menos un proveedor linkeado (habilitado).
     * @returns {boolean} `true` si hay al menos un proveedor, `false` en caso contrario.
     */
    hasAny() {
      return Boolean(db.select({ id: tenantProviders.id }).from(tenantProviders).limit(1).all()[0]);
    },

    /**
     * Busca un proveedor por (category, provider) y devuelve `{ configValuesJson }` cifrado.
     * El llamador se encarga del descifrado con `common/crypto`. Retorna `null` si no existe
     * o si está deshabilitado.
     * @param {Object} params - Parámetros de búsqueda.
     * @param {string} params.category - Categoría del proveedor.
     * @param {string} params.provider - Nombre del proveedor.
     * @returns {{ configValuesJson: string }|null} Config cifrada o `null`.
     */
    findByCategory({ category, provider }) {
      const row = db
        .select({ configValuesJson: tenantProviders.configValuesJson, enabled: tenantProviders.enabled })
        .from(tenantProviders)
        .where(and(eq(tenantProviders.category, category), eq(tenantProviders.provider, provider)))
        .limit(1)
        .all()[0];
      if (!row || !row.enabled) return null;
      return { configValuesJson: row.configValuesJson };
    },

    /**
     * Lista los proveedores linkeados con su estado. **Nunca** devuelve `configValuesJson` (cifrado):
     * la vista del asistente solo necesita categoría, nombre, si está habilitado, y — desde P8.4b —
     * el `settings` parseado (políticas del Master, no credenciales; expuesto en la UI del wizard).
     * @returns {Array<{ category: string, provider: string, enabled: number, settings: object }>}
     */
    list() {
      return db
        .select({
          category: tenantProviders.category,
          provider: tenantProviders.provider,
          enabled: tenantProviders.enabled,
          settingsJson: tenantProviders.settingsJson,
        })
        .from(tenantProviders)
        .all()
        .map((r) => {
          let settings = {};
          if (r.settingsJson) { try { settings = JSON.parse(r.settingsJson); } catch { /* corrupto → {} */ } }
          return { category: r.category, provider: r.provider, enabled: r.enabled, settings };
        });
    },

    /**
     * Deslinkea (deshabilita) un proveedor seteando `enabled=0`. La config cifrada se conserva
     * para relinkear posteriormente.
     * @param {Object} params - Parámetros de deshabilitación.
     * @param {string} params.category - Categoría del proveedor.
     * @param {string} params.provider - Nombre del proveedor.
     * @param {number} params.now - Timestamp de la operación (ms).
     */
    disable({ category, provider, now }) {
      db.update(tenantProviders)
        .set({ enabled: 0, updatedAt: now })
        .where(and(eq(tenantProviders.category, category), eq(tenantProviders.provider, provider)))
        .run();
    },

    /**
     * Inserta o actualiza la config cifrada de un proveedor (único por category+provider).
     * P8.4b: `settingsJson` es opcional y NO se pisa en updates si viene undefined — permite
     * updates de credenciales sin resetear las políticas del Master.
     * @param {Object} params - Parámetros del upsert.
     * @param {string} params.category - Categoría del proveedor.
     * @param {string} params.provider - Nombre del proveedor.
     * @param {string} params.configValuesJson - Config cifrada en JSON string.
     * @param {string} [params.settingsJson] - Settings JSON string (no se pisa si es undefined en updates).
     * @param {number} params.now - Timestamp de la operación (ms).
     */
    upsert({ category, provider, configValuesJson, settingsJson, now }) {
      const existing = db
        .select()
        .from(tenantProviders)
        .where(and(eq(tenantProviders.category, category), eq(tenantProviders.provider, provider)))
        .limit(1)
        .all()[0];
      if (existing) {
        const patch = { configValuesJson, enabled: 1, updatedAt: now };
        if (settingsJson !== undefined) patch.settingsJson = settingsJson;
        db.update(tenantProviders).set(patch).where(eq(tenantProviders.id, existing.id)).run();
      } else {
        db.insert(tenantProviders)
          .values({
            id: uuidv7(), category, provider, configValuesJson,
            settingsJson: settingsJson ?? null,
            enabled: 1, createdAt: now, updatedAt: now,
          })
          .run();
      }
    },

    /**
     * P8.4b: parcha SOLO el `settings_json` de un provider ya linkeado. No toca credenciales.
     * @param {Object} params - Parámetros de actualización.
     * @param {string} params.category - Categoría del proveedor.
     * @param {string} params.provider - Nombre del proveedor.
     * @param {string} params.settingsJson - Nuevo settings en JSON string.
     * @param {number} params.now - Timestamp de la operación (ms).
     * @returns {{ updated: boolean }} `true` si se actualizó, `false` si el provider no existe.
     */
    updateSettings({ category, provider, settingsJson, now }) {
      const existing = db
        .select({ id: tenantProviders.id })
        .from(tenantProviders)
        .where(and(eq(tenantProviders.category, category), eq(tenantProviders.provider, provider)))
        .limit(1)
        .all()[0];
      if (!existing) return { updated: false };
      db.update(tenantProviders)
        .set({ settingsJson, updatedAt: now })
        .where(eq(tenantProviders.id, existing.id))
        .run();
      return { updated: true };
    },

    /**
     * P8.4b: lee el `settingsJson` parseado del provider (o null si no existe / no tiene).
     * @param {Object} params - Parámetros de consulta.
     * @param {string} params.category - Categoría del proveedor.
     * @param {string} params.provider - Nombre del proveedor.
     * @returns {object|null} Settings parseados, objeto vacío si no hay settings, o `null` si no existe.
     */
    getSettings({ category, provider }) {
      const row = db
        .select({ settingsJson: tenantProviders.settingsJson, enabled: tenantProviders.enabled })
        .from(tenantProviders)
        .where(and(eq(tenantProviders.category, category), eq(tenantProviders.provider, provider)))
        .limit(1)
        .all()[0];
      if (!row) return null;
      try { return row.settingsJson ? JSON.parse(row.settingsJson) : {}; }
      catch { return {}; }
    },

    /**
     * Captura el estado completo de `tenant_providers` (config cifrada + enabled) para poder
     * restaurarlo si el operador aborta el draft. Sólo se llama al iniciar un draft nuevo.
     * NO se desencripta — se guarda el blob tal cual está.
     * @returns {Array<{ category: string, provider: string, configValuesJson: string, enabled: number }>}
     */
    snapshot() {
      return db
        .select({
          category: tenantProviders.category,
          provider: tenantProviders.provider,
          configValuesJson: tenantProviders.configValuesJson,
          enabled: tenantProviders.enabled,
        })
        .from(tenantProviders)
        .all()
        .map((r) => ({ ...r, enabled: r.enabled ? 1 : 0 }));
    },

    /**
     * Restaura `tenant_providers` al estado del snapshot capturado al iniciar el draft. Semántica:
     *  - Providers en el snapshot → se upsertan con la config y `enabled` del snapshot.
     *  - Providers presentes AHORA pero ausentes del snapshot (linkeados durante el draft) → se
     *    deshabilitan (no se borra la fila para preservar credenciales por si el operador quiere
     *    re-linkear luego, misma semántica que `disable`).
     * @param {Array<{ category: string, provider: string, configValuesJson: string, enabled: 0|1 }>} snapshot
     *   - Snapshot previamente capturado con `snapshot()`.
     * @param {number} now - Timestamp de la operación (ms).
     * @returns {number} Cantidad de filas afectadas (restauradas + deshabilitadas).
     */
    restoreFromSnapshot(snapshot, now) {
      const snapshotSet = new Set((snapshot ?? []).map((s) => `${s.category}::${s.provider}`));
      let affected = 0;

      // 1) Restaurar cada entrada del snapshot a su valor exacto.
      for (const entry of snapshot ?? []) {
        const existing = db
          .select()
          .from(tenantProviders)
          .where(and(eq(tenantProviders.category, entry.category), eq(tenantProviders.provider, entry.provider)))
          .limit(1)
          .all()[0];
        if (existing) {
          db.update(tenantProviders)
            .set({ configValuesJson: entry.configValuesJson, enabled: entry.enabled, updatedAt: now })
            .where(eq(tenantProviders.id, existing.id))
            .run();
        } else {
          db.insert(tenantProviders)
            .values({
              id: uuidv7(),
              category: entry.category,
              provider: entry.provider,
              configValuesJson: entry.configValuesJson,
              enabled: entry.enabled,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        }
        affected += 1;
      }

      // 2) Deshabilitar cualquier provider actual que NO existía en el snapshot (linkeado durante el draft).
      const currentRows = db.select({
        id: tenantProviders.id,
        category: tenantProviders.category,
        provider: tenantProviders.provider,
        enabled: tenantProviders.enabled,
      }).from(tenantProviders).all();
      for (const row of currentRows) {
        const key = `${row.category}::${row.provider}`;
        if (!snapshotSet.has(key) && row.enabled) {
          db.update(tenantProviders)
            .set({ enabled: 0, updatedAt: now })
            .where(eq(tenantProviders.id, row.id))
            .run();
          affected += 1;
        }
      }
      return affected;
    },
  };
}
