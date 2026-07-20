import { MongoClient } from 'mongodb';

/**
 * Store NoSQL del No-Code sobre **MongoDB Atlas**. Misma interfaz que `neon-tech.adapter` para que
 * el dispatcher opere indistintamente. Schemaless: `ensureResource` crea la colección + índice; los
 * cambios de tipo/add son metadata (se reflejan al escribir); `migrate` solo aplica renombres
 * (`$rename`). Ver no-code.md. `deleted_at` ausente o `null` = no borrado.
 *
 * @param {string} uri - URI de conexión de Mongo del tenant.
 * @returns {{
 *   ensureResource: (resource: object) => Promise<void>,
 *   insert: (physicalName: string, row: object) => Promise<object>,
 *   findMany: (physicalName: string, opts?: { limit?: number, offset?: number, where?: object }) => Promise<object[]>,
 *   findById: (physicalName: string, id: string) => Promise<object|null>,
 *   update: (physicalName: string, id: string, patch: object) => Promise<object|null>,
 *   softDelete: (physicalName: string, id: string, now: number) => Promise<boolean>,
 *   migrate: (physicalName: string, diff: object) => Promise<void>,
 *   close: () => Promise<void>
 * }}
 */
export function createMongoStore(uri) {
  const client = new MongoClient(uri);
  let dbPromise = null;
  const db = () => (dbPromise ??= client.connect().then((c) => c.db()));
  const coll = async (name) => (await db()).collection(name);
  const NOT_DELETED = { deleted_at: null };

  return {
    /**
     * Crea (idempotente) la colección física de una resource y su índice único por `id`.
     *
     * @param {object} resource - Resource del contrato con `physicalName`.
     */
    async ensureResource(resource) {
      const database = await db();
      const exists = await database.listCollections({ name: resource.physicalName }).toArray();
      if (exists.length === 0) await database.createCollection(resource.physicalName);
      await database.collection(resource.physicalName).createIndex({ id: 1 }, { unique: true });
    },

    /**
     * Inserta un documento en la colección.
     *
     * @param {string} physicalName - Nombre físico de la colección.
     * @param {object} row - Documento a insertar.
     * @returns {Promise<object>} Documento insertado.
     */
    async insert(physicalName, row) {
      await (await coll(physicalName)).insertOne({ ...row });
      return row;
    },

    /**
     * Lista documentos no borrados (más recientes primero), paginado y filtrado.
     *
     * @param {string} physicalName - Nombre físico de la colección.
     * @param {object} [opts] - Opciones de consulta.
     * @param {number} [opts.limit=50] - Máximo de documentos a retornar.
     * @param {number} [opts.offset=0] - Número de documentos a saltar.
     * @param {object} [opts.where=null] - Filtros adicionales (AND).
     * @returns {Promise<object[]>} Lista de documentos.
     */
    async findMany(physicalName, { limit = 50, offset = 0, where = null } = {}) {
      const filter = { ...NOT_DELETED, ...where };
      return (await coll(physicalName))
        .find(filter, { projection: { _id: 0 } })
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();
    },

    /**
     * Obtiene un documento por su `id` (no borrado) o `null`.
     *
     * @param {string} physicalName - Nombre físico de la colección.
     * @param {string} id - ID del documento.
     * @returns {Promise<object|null>} Documento encontrado o `null`.
     */
    async findById(physicalName, id) {
      return (await coll(physicalName)).findOne({ id, ...NOT_DELETED }, { projection: { _id: 0 } });
    },

    /**
     * Actualiza un documento (no borrado) y devuelve la versión actualizada, o `null` si no existe.
     *
     * @param {string} physicalName - Nombre físico de la colección.
     * @param {string} id - ID del documento.
     * @param {object} patch - Campos a actualizar ($set).
     * @returns {Promise<object|null>} Documento actualizado o `null`.
     */
    async update(physicalName, id, patch) {
      return (
        (await (await coll(physicalName)).findOneAndUpdate(
          { id, ...NOT_DELETED },
          { $set: patch },
          { returnDocument: 'after', projection: { _id: 0 } },
        )) ?? null
      );
    },

    /**
     * Borrado lógico: marca `deleted_at` en el documento.
     *
     * @param {string} physicalName - Nombre físico de la colección.
     * @param {string} id - ID del documento.
     * @param {number} now - Timestamp epoch ms.
     * @returns {Promise<boolean>} `true` si afectó un documento.
     */
    async softDelete(physicalName, id, now) {
      const res = await (await coll(physicalName)).updateOne({ id, ...NOT_DELETED }, { $set: { deleted_at: now } });
      return res.modifiedCount > 0;
    },

    async softDeleteAll(physicalName, now) {
      await (await coll(physicalName)).updateMany({ deleted_at: null }, { $set: { deleted_at: now } });
    },

    /**
     * Schemaless: solo los renombres requieren tocar los documentos (`$rename`).
     *
     * @param {string} physicalName - Nombre físico de la colección.
     * @param {{ renames: { from: string, to: string }[] }} diff - Diff de migración.
     */
    async migrate(physicalName, diff) {
      if (!diff.renames?.length) return;
      const rename = Object.fromEntries(diff.renames.map((r) => [r.from, r.to]));
      await (await coll(physicalName)).updateMany({}, { $rename: rename });
    },

    /**
     * Cierra la conexión con MongoDB.
     *
     * @returns {Promise<void>}
     */
    async close() {
      await client.close();
    },
  };
}
