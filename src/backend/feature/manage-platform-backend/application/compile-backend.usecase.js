/**
 * Compila el esquema físico de un contrato sobre el store del tenant (no-code.md, paso 8): por
 * cada resource, si su tabla ya existía (mismo `physicalName` en el contrato anterior) calcula el diff
 * por `field.id` y **migra**; si es nueva, la **crea**. Así, re-publicar evoluciona las tablas sin
 * perder datos.
 *
 * @param {{ resolveStore: Function, tenantId: string, tenantDb: object, diffResources: Function }} deps
 * @returns {(params: { previous: Object|null, current: Object }) => Promise<void>} Función de caso de uso.
 */
export function makeCompileBackend({ resolveStore, tenantId, tenantDb, diffResources }) {
  /**
   * Compila el esquema físico de un contrato sobre el store del tenant.
   * Crea tablas nuevas o migra existentes según diff por field.id.
   * @param {Object} params
   * @param {Object|null} params.previous - Contrato anterior (null si es primer publish).
   * @param {Object} params.current - Contrato actual a compilar.
   * @returns {Promise<void>}
   */
  return async function compileBackend({ previous, current }) {
    for (const resource of current.resources) {
      const store = await resolveStore({ tenantId, tenantDb, storeType: resource.store });
      const old = previous?.resources.find((r) => r.physicalName === resource.physicalName);
      if (old) {
        await store.migrate(resource.physicalName, diffResources(old, resource), current.resources);
      } else {
        await store.ensureResource(resource, current.resources);
      }
    }
  };
}
