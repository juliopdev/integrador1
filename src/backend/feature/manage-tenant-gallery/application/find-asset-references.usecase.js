/**
 * P8.2: encuentra las filas de resources dinámicos que referencian un asset dado (por su `url`).
 * Se usa desde `delete-asset` para el hard-block "ASSET_IN_USE".
 *
 * Estrategia:
 *  1. Cargar el contrato activo del tenant.
 *  2. Filtrar resources con al menos un field de type='asset'.
 *  3. Para cada uno, resolver el store (Neon/Mongo) y buscar filas donde alguno de esos fields
 *     tenga el valor = url del asset.
 *  4. Agregar los hallazgos como `[{ resource, field, rowId }]`.
 *
 * Coste: N queries a Neon/Mongo por delete, donde N = resources con fields asset. Aceptable en
 * MVP — un Master borra pocos assets. Si escala molesta, cachear en `assets.referenced_by_json`.
 *
 * @param {{
 *   contractRepository: object,
 *   resolveStore: (params: { tenantId: string, tenantDb: object, storeType: 'sql'|'nosql' }) => Promise<object>,
 *   tenantId: string,
 *   tenantDb: object,
 *   logger: import('pino').Logger,
 * }} deps
 * @returns {(params: { url: string }) => Promise<Array<{ resource: string, field: string, rowId: string }>>}
 */
/**
 * @param {Object} deps
 * @param {Object} deps.contractRepository
 * @param {Function} deps.resolveStore
 * @param {string} deps.tenantId
 * @param {Object} deps.tenantDb
 * @param {import('pino').Logger} deps.logger
 * @returns {(params: { url: string }) => Promise<Array<{ resource: string, field: string, rowId: string }>>}
 */
export function makeFindAssetReferences({ contractRepository, resolveStore, tenantId, tenantDb, logger }) {
  /**
   * Busca filas de resources dinámicos que referencian un asset por su URL.
   * Itera los resources con campos de tipo "asset" y consulta en el store activo.
   * @param {Object} params
   * @param {string} params.url - URL del asset a buscar.
   * @returns {Promise<Array<{ resource: string, field: string, rowId: string }>>}
   */
  return async function findAssetReferences({ url }) {
    const active = contractRepository.getActiveContract?.();
    if (!active) return [];

    const references = [];
    for (const resource of active.schema?.resources ?? []) {
      const assetFields = (resource.fields ?? []).filter((f) => f.type === 'asset');
      if (assetFields.length === 0) continue;

      let store;
      try {
        store = await resolveStore({ tenantId, tenantDb, storeType: resource.store });
      } catch (err) {
        // Store no configurado / provider deshabilitado / adapter no disponible → no podemos
        // chequear, así que fail-CLOSED: log + tratar como "hay referencias" para no dejar borrar.
        logger.warn({ err, resource: resource.name }, '[find-asset-references] no se pudo resolver store; asumiendo referencia');
        references.push({ resource: resource.name, field: '?', rowId: 'unknown' });
        continue;
      }

      for (const field of assetFields) {
        try {
          const rows = await store.findByFieldValue?.(resource.physicalName, field.name, url);
          if (Array.isArray(rows) && rows.length > 0) {
            for (const row of rows) {
              references.push({ resource: resource.name, field: field.name, rowId: row.id ?? row._id ?? 'unknown' });
            }
          }
        } catch (err) {
          logger.warn({ err, resource: resource.name, field: field.name }, '[find-asset-references] fallo query; asumiendo referencia');
          references.push({ resource: resource.name, field: field.name, rowId: 'unknown' });
        }
      }
    }
    return references;
  };
}
