/**
 * Iter 32 F: función pura que compara `draft.schema` contra `publishedContract.schema` y devuelve
 * counts por sección (resources / fields / endpoints / auth / websocket). Se usa en el paso
 * `_step-finish` para renderizar un mini-diff antes de publicar — el Superadmin ve cuántos cambios
 * está a punto de aplicar y confirma con un prompt (patrón `data-confirm` del Form component).
 *
 * No es un usecase: no toca repos, no valida — solo cuenta. Vive en `application/` porque es
 * lógica de dominio (comparación de dos snapshots de contrato).
 *
 * Reglas de diff:
 * - **resources**: por `name`. Añadido/removido = sólo aparece en uno. Modificado = mismo nombre
 *   pero cambia `physicalName` o `store` (no cuenta cambios de fields — eso vive en su propio bloque).
 * - **fields**: por `field.id` (la clave estable que preserva data en la migración — no-code.md).
 *   Se cuentan de forma agregada sobre todos los resources compartidos por nombre.
 *   Modificado = mismo id pero cambia name/type/required.
 * - **endpoints**: por `path` exacto. Modificado = mismo path pero cambia `resource` o `methods`.
 * - **auth**: `changed` bool si `userAuthEnabled` o `strategies` o `redirectUris` difieren.
 * - **websocket**: canales por `name`. Añadido/removido = sólo en uno; modificado = mismo name pero
 *   cambia `enabled` o `mode`.
 *
 * Sin draft (o sin published) devuelve un `null` — la vista sabe distinguir "no hay draft para
 * publicar" vs "primer publish, todo es nuevo".
 */
/**
 * Compara draft.schema vs publishedContract.schema y devuelve counts por sección.
 * @param {Object} params
 * @param {Object|null} params.draftSchema - Schema del draft actual (null si no hay).
 * @param {Object|null} params.publishedSchema - Schema del contrato publicado (null si no hay).
 * @returns {Object|null} Objeto con diff counts (resources, fields, endpoints, auth, websocket, total)
 *   o null si no hay draft.
 */
export function summarizeContractChanges({ draftSchema, publishedSchema }) {
  if (!draftSchema) return null;
  // Primer publish: no hay published, todo lo del draft es "añadido". Devolvemos counts contra
  // un schema vacío equivalente para dar visibilidad del alcance.
  const base = publishedSchema || { resources: [], endpoints: [], auth: {}, websocket: { channels: [] } };

  const resourcesDiff = diffByKey(base.resources || [], draftSchema.resources || [], 'name', (a, b) =>
    a.physicalName !== b.physicalName || a.store !== b.store,
  );

  // Fields: se agregan por resource compartido (name). Si el resource es nuevo/eliminado, sus
  // fields cuentan en `resources.added/removed` pero NO se re-cuentan en `fields` — el mini-diff
  // muestra ambos niveles y contarlos dos veces confundiría la escala del cambio.
  const draftResByName = new Map((draftSchema.resources || []).map((r) => [r.name, r]));
  const pubResByName = new Map((base.resources || []).map((r) => [r.name, r]));
  let fAdded = 0;
  let fRemoved = 0;
  let fModified = 0;
  for (const name of draftResByName.keys()) {
    if (!pubResByName.has(name)) continue;
    const d = diffByKey(pubResByName.get(name).fields || [], draftResByName.get(name).fields || [], 'id', (a, b) =>
      a.name !== b.name || a.type !== b.type || Boolean(a.required) !== Boolean(b.required),
    );
    fAdded += d.added;
    fRemoved += d.removed;
    fModified += d.modified;
  }

  const endpointsDiff = diffByKey(base.endpoints || [], draftSchema.endpoints || [], 'path', (a, b) =>
    a.resource !== b.resource || !sameArray(a.methods || [], b.methods || []),
  );

  const draftAuth = draftSchema.auth || {};
  const pubAuth = base.auth || {};
  const authChanged = Boolean(draftAuth.userAuthEnabled) !== Boolean(pubAuth.userAuthEnabled)
    || !sameArray(draftAuth.strategies || [], pubAuth.strategies || [])
    || !sameArray(draftAuth.redirectUris || [], pubAuth.redirectUris || []);

  const wsDiff = diffByKey(
    (base.websocket?.channels) || [],
    (draftSchema.websocket?.channels) || [],
    'name',
    (a, b) => Boolean(a.enabled) !== Boolean(b.enabled) || a.mode !== b.mode,
  );

  const total = resourcesDiff.added + resourcesDiff.removed + resourcesDiff.modified
    + fAdded + fRemoved + fModified
    + endpointsDiff.added + endpointsDiff.removed + endpointsDiff.modified
    + (authChanged ? 1 : 0)
    + wsDiff.added + wsDiff.removed + wsDiff.modified;

  return {
    isFirstPublish: !publishedSchema,
    resources: resourcesDiff,
    fields: { added: fAdded, removed: fRemoved, modified: fModified },
    endpoints: endpointsDiff,
    auth: { changed: authChanged },
    websocket: wsDiff,
    total,
  };
}

/**
 * Calcula diff genérico entre dos arrays de objetos usando una key de identidad.
 * @param {Object[]} oldItems - Array anterior.
 * @param {Object[]} newItems - Array nuevo.
 * @param {string} keyName - Nombre de la propiedad de identidad.
 * @param {(a: Object, b: Object) => boolean} isModified - Función que determina si cambió.
 * @returns {{added: number, removed: number, modified: number}} Conteo de cambios.
 */
function diffByKey(oldItems, newItems, keyName, isModified) {
  const oldMap = new Map(oldItems.map((it) => [it[keyName], it]));
  const newMap = new Map(newItems.map((it) => [it[keyName], it]));
  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const [k, v] of newMap) {
    if (!oldMap.has(k)) added += 1;
    else if (isModified(oldMap.get(k), v)) modified += 1;
  }
  for (const k of oldMap.keys()) {
    if (!newMap.has(k)) removed += 1;
  }
  return { added, removed, modified };
}

/**
 * Compara dos arrays de strings sin importar el orden.
 * @param {string[]} a - Primer array.
 * @param {string[]} b - Segundo array.
 * @returns {boolean} True si contienen los mismos elementos.
 */
function sameArray(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}
