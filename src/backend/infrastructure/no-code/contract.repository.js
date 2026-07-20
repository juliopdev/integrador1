import { and, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from '../../common/id.js';
import { backendContracts } from '../../config/drizzle/schema-tenant.js';

// Clave interna del row del draft. La tabla `backend_contracts` tiene UNIQUE en `version`, así
// que el draft NUNCA puede usar la misma clave que una versión publicada/retirada (v1, v2…).
// Usamos un centinela con prefijo `__` para que sea obvio en la DB que es una fila de estado,
// no un snapshot de versión. El `schema.version` interno del draft mantiene el número REAL que
// producirá al publicar (v1 si edit, v(N+1) si upgrade).
const DRAFT_ROW_KEY = '__draft__';

/**
 * Repositorio del contrato No-Code en `backend_contracts` del `tenant.db` (no-code.md). El
 * contrato activo es el de `status='published'`; publicar uno retira el anterior (rollback = reactivar
 * un snapshot previo, que se construye en el incremento de versionado). Recibe la conexión del tenant.
 *
 * Iter UX P2.1: separación estricta entre el ROW del draft y el ROW de las versiones publicadas.
 * Antes, `saveDraft({ version: 'v1' })` hacía UPDATE sobre la fila publicada `v1` reescribiéndola
 * como draft — un bug crítico que "eliminaba" la versión activa apenas el operador clickeaba
 * "Editar versión actual". Ahora el draft SIEMPRE vive en `version = "__draft__"` y las
 * publicadas/retiradas quedan intactas.
 *
 * @param {{ db: object }} deps - Dependencias del repositorio.
 * @param {object} deps.db - Conexión Drizzle a la base de datos del tenant.
 * @returns {{
 *   getActiveContract: () => { version: string, status: string, schema: object } | null,
 *   getByVersion: (version: string) => object | null,
 *   list: () => Array<{ version: string, status: string, publishedAt: number }>,
 *   retire: (params: { version: string, now: number }) => void,
 *   deleteByVersion: (version: string) => number,
 *   updateActiveSchema: (params: { schemaJson: string, now: number }) => void,
 *   getDraft: () => { version: string, status: string, schema: object } | null,
 *   saveDraft: (params: { version: string, schemaJson: string, now: number }) => void,
 *   deleteDraft: () => number,
 *   publish: (params: { version: string, schemaJson: string, now: number }) => void
 * }}
 */
export function createContractRepository({ db }) {
  return {
    /**
     * Contrato activo (publicado) con su `schema` ya parseado, o `null`.
     *
     * @returns {{ version: string, status: string, schema: object } | null}
     */
    getActiveContract() {
      const row = db.select().from(backendContracts).where(eq(backendContracts.status, 'published')).limit(1).all()[0];
      return row ? { version: row.version, status: row.status, schema: JSON.parse(row.schemaJson) } : null;
    },

    /**
     * Obtiene un contrato por su versión exacta.
     *
     * @param {string} version - Versión del contrato (ej. "v1", "v2").
     * @returns {object | null} Fila completa del contrato o `null` si no existe.
     */
    getByVersion(version) {
      return db.select().from(backendContracts).where(eq(backendContracts.version, version)).limit(1).all()[0] ?? null;
    },

    /**
     * Lista los contratos publicados/retirados (versión + estado), sin el `schema_json` completo.
     * El row del draft (`version='__draft__'`) NO se incluye — el historial es sobre versiones
     * reales del contrato. Para el draft se usa `getDraft()`.
     *
     * @returns {Array<{ version: string, status: string, publishedAt: number }>}
     */
    list() {
      return db.select({ version: backendContracts.version, status: backendContracts.status, publishedAt: backendContracts.publishedAt })
        .from(backendContracts)
        .where(inArray(backendContracts.status, ['published', 'retired']))
        .all();
    },

    /**
     * Eliminación lógica de un contrato (estado `retired`). No toca los datos de negocio.
     *
     * @param {{ version: string, now: number }} params - Versión a retirar y timestamp actual.
     */
    retire({ version, now }) {
      db.update(backendContracts).set({ status: 'retired', updatedAt: now }).where(eq(backendContracts.version, version)).run();
    },

    /**
     * Eliminación física de un snapshot RETIRED (P2.4). Nunca borra la publicada ni el draft
     * (esos flujos tienen sus propias operaciones). Se usa cuando el operador quiere purgar
     * versiones antiguas del historial.
     *
     * @param {string} version - Versión del contrato a eliminar físicamente.
     * @returns {number} Número de filas afectadas (0 si no se eliminó nada).
     */
    deleteByVersion(version) {
      const res = db.delete(backendContracts)
        .where(and(eq(backendContracts.version, version), eq(backendContracts.status, 'retired')))
        .run();
      return res.changes ?? 0;
    },

    /**
     * Reescribe el `schema_json` del contrato publicado (toggles de auth/ws sobre la versión actual).
     *
     * @param {{ schemaJson: string, now: number }} params - Nuevo schema JSON y timestamp.
     */
    updateActiveSchema({ schemaJson, now }) {
      db.update(backendContracts).set({ schemaJson, updatedAt: now }).where(eq(backendContracts.status, 'published')).run();
    },

    /**
     * Retorna el contrato en construcción (`status='draft'`) del tenant o `null`. Solo puede
     * haber uno por tenant. La `version` retornada es la del schema interno (v1/v2/…) — la clave
     * del row (`__draft__`) es un detalle de persistencia y no debe filtrarse al UI.
     *
     * @returns {{ version: string, status: string, schema: object } | null}
     */
    getDraft() {
      const row = db.select().from(backendContracts).where(eq(backendContracts.status, 'draft')).limit(1).all()[0];
      if (!row) return null;
      const schema = JSON.parse(row.schemaJson);
      return { version: schema.version || row.version, status: row.status, schema };
    },

    /**
     * Upsert del draft. Identidad = `status='draft'` (no la version del schema), así que llamar
     * a saveDraft NUNCA reescribe una fila publicada/retirada — sólo actualiza el draft actual
     * o inserta uno nuevo con clave `__draft__`. El `version` del argumento se conserva en el
     * schema para que el use case de publicación sepa qué versión producir.
     *
     * @param {{ version: string, schemaJson: string, now: number }} params - Versión del schema, JSON stringificado y timestamp.
     */
    saveDraft({ version, schemaJson, now }) {
      const existing = db.select().from(backendContracts).where(eq(backendContracts.status, 'draft')).limit(1).all()[0];
      if (existing) {
        db.update(backendContracts)
          .set({ schemaJson, updatedAt: now })
          .where(eq(backendContracts.id, existing.id))
          .run();
      } else {
        db.insert(backendContracts)
          .values({ id: uuidv7(), version: DRAFT_ROW_KEY, schemaJson, status: 'draft', createdAt: now, updatedAt: now })
          .run();
      }
    },

    /**
     * Elimina el draft actual del tenant. La identidad del draft es su status, no su version.
     * Devuelve el número de filas eliminadas.
     *
     * @returns {number} Número de filas eliminadas (0 si no había draft).
     */
    deleteDraft(/* version */) {
      const res = db.delete(backendContracts).where(eq(backendContracts.status, 'draft')).run();
      return res.changes ?? 0;
    },

    /**
     * Publica una versión del contrato: retira el publicado anterior (si existe) y crea o
     * reescribe la fila de la versión con estado `published`. Todo dentro de una transacción.
     *
     * @param {{ version: string, schemaJson: string, now: number }} params - Versión a publicar, schema JSON y timestamp.
     */
    publish({ version, schemaJson, now }) {
      db.transaction((tx) => {
        tx.update(backendContracts).set({ status: 'retired', updatedAt: now }).where(eq(backendContracts.status, 'published')).run();
        const existing = tx.select().from(backendContracts).where(eq(backendContracts.version, version)).limit(1).all()[0];
        if (existing) {
          tx.update(backendContracts)
            .set({ schemaJson, status: 'published', publishedAt: now, updatedAt: now })
            .where(eq(backendContracts.version, version))
            .run();
        } else {
          tx.insert(backendContracts)
            .values({ id: uuidv7(), version, schemaJson, status: 'published', publishedAt: now, createdAt: now, updatedAt: now })
            .run();
        }
      });
    },
  };
}
