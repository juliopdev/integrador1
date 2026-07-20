import { and, count, desc, eq, isNull, inArray } from 'drizzle-orm';
import { assets } from '../../../config/drizzle/schema-tenant.js';

/**
 * @typedef {Object} AssetRepository
 * @property {(row: object) => void} insert - Persiste un asset recién subido.
 * @property {(id: string) => (object|null)} findActiveById - Devuelve un asset por id o `null` si no existe o está soft-deleted.
 * @property {(params: object) => Array<object>} listActive - Lista assets activos con filtros + pagination.
 * @property {(params: object) => number} countActive - Cuenta assets activos con los mismos filtros (para pageMeta).
 * @property {(params: { id: string, now: number }) => void} softDelete - Marca `deletedAt` en el asset (audit preserva la fila).
 * @property {() => boolean} hasAny - ¿Hay al menos un asset activo? Usado por la vista para ocultar el link del sidebar en tenants nuevos.
 */

/**
 * Repositorio del catálogo LOCAL de assets del tenant (P8.2). Guarda solo metadatos — los bytes
 * viven en el CDN de Cloudinary/Box. Filtros SQL rápidos, pagination con `common/pagination.js`.
 *
 * @param {{ db: object }} deps - Drizzle sobre el tenant.db del LRU pool.
 * @returns {AssetRepository}
 */
/**
 * @param {Object} deps
 * @param {Object} deps.db - Drizzle handle sobre tenant.db.
 * @returns {import('./asset.repository.js').AssetRepository}
 */
export function createAssetRepository({ db }) {
  return {
    /**
     * Persiste un asset recién subido en el catálogo local.
     * @param {Object} row
     * @param {string} row.id
     * @param {string} row.provider
     * @param {string} row.publicId
     * @param {string} row.url
     * @param {number} row.bytes
     * @param {string|null} [row.format]
     * @param {string|null} [row.mimeType]
     * @param {string|null} [row.filename]
     * @param {string|null} [row.resourceName]
     * @param {string|null} [row.fieldName]
     * @param {string|null} [row.rowId]
     * @param {string|null} [row.uploadedBy]
     * @param {number} row.uploadedAt
     * @param {number|null} row.deletedAt
     */
    insert(row) {
      db.insert(assets).values(row).run();
    },

    /**
     * Devuelve un asset activo por su ID o null si no existe o está soft-deleted.
     * @param {string} id - UUIDv7 del asset.
     * @returns {Object|null}
     */
    findActiveById(id) {
      const rows = db.select().from(assets)
        .where(and(eq(assets.id, id), isNull(assets.deletedAt)))
        .limit(1)
        .all();
      return rows[0] ?? null;
    },

    /**
     * Lista assets activos con filtros combinables. `mimeFamilies` es un array de prefijos
     * (`['image', 'video']`) — el filtrado LIKE en SQL es sobre `mime_type`.
     *
     * @param {{ limit: number, offset: number, provider?: string, mimeFamilies?: string[] }} params
     */
    listActive({ limit, offset, provider = null, mimeFamilies = null }) {
      const conds = [isNull(assets.deletedAt)];
      if (provider) conds.push(eq(assets.provider, provider));
      if (mimeFamilies?.length) {
        // Enum-style match sobre familia de mime — SQLite no soporta LIKE-eq eficiente en múltiples
        // prefijos, así que expandimos a IN(...). Se asume que el caller pasa familias válidas
        // (validado en el schema).
        conds.push(inArray(assets.mimeType, expandMimeFamilies(mimeFamilies)));
      }
      return db.select().from(assets)
        .where(and(...conds))
        .orderBy(desc(assets.uploadedAt))
        .limit(limit)
        .offset(offset)
        .all();
    },

    /**
     * Cuenta assets activos con los mismos filtros que listActive (para construir pageMeta).
     * @param {Object} params
     * @param {string|null} [params.provider]
     * @param {string[]|null} [params.mimeFamilies]
     * @returns {number}
     */
    countActive({ provider = null, mimeFamilies = null }) {
      const conds = [isNull(assets.deletedAt)];
      if (provider) conds.push(eq(assets.provider, provider));
      if (mimeFamilies?.length) {
        conds.push(inArray(assets.mimeType, expandMimeFamilies(mimeFamilies)));
      }
      const [row] = db.select({ n: count() }).from(assets).where(and(...conds)).all();
      return row?.n ?? 0;
    },

    /**
     * Marca deletedAt en el asset (soft-delete). Preserva la fila para audit trail.
     * @param {Object} params
     * @param {string} params.id - UUIDv7 del asset.
     * @param {number} params.now - Timestamp ms.
     */
    softDelete({ id, now }) {
      db.update(assets).set({ deletedAt: now }).where(eq(assets.id, id)).run();
    },

    /**
     * Retorna true si existe al menos un asset activo en el catálogo.
     * Usado por la vista para ocultar el link del sidebar en tenants nuevos.
     * @returns {boolean}
     */
    hasAny() {
      const rows = db.select({ id: assets.id }).from(assets)
        .where(isNull(assets.deletedAt))
        .limit(1)
        .all();
      return rows.length > 0;
    },

    /**
     * Todos los assets activos (sin paginar) — usado por `find-asset-references` cuando el caller
     * necesita chequear referencias cruzadas. NO se expone en la API pública.
     */
    /**
     * Todos los assets activos sin paginar. NO expuesto en la API pública.
     * @returns {Array<Object>}
     */
    listAllActive() {
      return db.select().from(assets).where(isNull(assets.deletedAt)).all();
    },
  };
}

// Set curado de MIMEs por familia. Debe alinearse con `ALLOWED_MIMES` de `upload-dynamic-asset.usecase.js`
// (crecer el enum requiere tocar ambos). Mantener acá evita LIKE lento en SQLite.
const MIME_FAMILIES = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'],
  video: ['video/mp4', 'video/webm'],
  audio: ['audio/mpeg', 'audio/webm'],
  document: ['application/pdf', 'text/csv', 'text/plain', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/vnd.ms-excel',
             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

/**
 * Expande una lista de familias MIME a los tipos concretos definidos en MIME_FAMILIES.
 * @param {string[]} families - Familias a expandir (image, video, audio, document).
 * @returns {string[]} Lista de tipos MIME concretos.
 * @example
 * expandMimeFamilies(['image', 'audio']) // ['image/png', 'image/jpeg', … , 'audio/mpeg', 'audio/webm']
 */
function expandMimeFamilies(families) {
  const out = [];
  for (const fam of families) {
    if (MIME_FAMILIES[fam]) out.push(...MIME_FAMILIES[fam]);
  }
  return out;
}

export { MIME_FAMILIES };
