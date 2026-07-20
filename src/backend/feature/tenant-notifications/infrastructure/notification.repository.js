import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { notifications } from '../../../config/drizzle/schema-tenant.js';

/**
 * Repositorio de notificaciones del tenant (`tenant.db`, tabla `notifications`).
 *
 * El shape del schema declara `audience ∈ {public, authenticated, segment}` y
 * `status ∈ {draft, scheduled, published, canceled}`. Este slice implementa **publish inmediato**
 * (status='published' + publishedAt) y el feed público filtrado por audience. Los slots
 * `draft/scheduled/canceled` quedan cableados para el slice 2 (scheduling + Master view).
 *
 * @param {{ db: object }} deps — `db` es el handle drizzle del `tenant.db` (per-tenant).
 * @returns {Object}
 */
export function createNotificationRepository({ db }) {
  return {
    /**
     * Persiste una notificación ya publicada (status='published', publishedAt fijo).
     * @param {Object} params
     * @param {string} params.id - UUIDv7.
     * @param {string} params.title
     * @param {string} params.body
     * @param {string} params.audience - 'public' | 'authenticated'.
     * @param {string} params.createdBy - ID del autor.
     * @param {number} params.now - Timestamp ms.
     */
    insertPublished({ id, title, body, audience, createdBy, now }) {
      db.insert(notifications).values({
        id, title, body, audience,
        status: 'published',
        publishedAt: now,
        createdBy,
        createdAt: now,
        updatedAt: now,
      }).run();
    },

    /**
     * Feed de notificaciones publicadas ordenado por `publishedAt DESC`.
     *
     * `visibleAudiences` filtra qué audiences puede ver el request actual:
     * - user no autenticado: `['public']`
     * - user autenticado: `['public', 'authenticated']`
     * - `segment` queda fuera hasta que el slice 2 defina la política.
     */
    /**
     * Feed de notificaciones publicadas ordenado por publishedAt DESC.
     * @param {Object} params
     * @param {string[]} params.visibleAudiences - Audiencias visibles (ej: ['public'] o ['public', 'authenticated']).
     * @param {number} [params.limit=20] - Máx. registros.
     * @param {number} [params.offset=0] - Desplazamiento.
     * @returns {Array<{ id: string, title: string, body: string, audience: string, publishedAt: number }>}
     */
    listPublished({ visibleAudiences, limit = 20, offset = 0 }) {
      return db
        .select({
          id: notifications.id,
          title: notifications.title,
          body: notifications.body,
          audience: notifications.audience,
          publishedAt: notifications.publishedAt,
        })
        .from(notifications)
        .where(and(
          eq(notifications.status, 'published'),
          inArray(notifications.audience, visibleAudiences),
        ))
        .orderBy(desc(notifications.publishedAt))
        .limit(limit)
        .offset(offset)
        .all();
    },

    // ── Slice 2: scheduling ──────────────────────────────────────────────

    /**
     * Persiste una notificación programada (status='scheduled', publishedAt=null).
     * @param {Object} params
     * @param {string} params.id - UUIDv7.
     * @param {string} params.title
     * @param {string} params.body
     * @param {string} params.audience - 'public' | 'authenticated'.
     * @param {number} params.scheduledAt - Timestamp ms de publicación programada.
     * @param {string} params.createdBy - ID del autor.
     * @param {number} params.now - Timestamp ms.
     */
    insertScheduled({ id, title, body, audience, scheduledAt, createdBy, now }) {
      db.insert(notifications).values({
        id, title, body, audience,
        status: 'scheduled',
        scheduledAt,
        createdBy,
        createdAt: now,
        updatedAt: now,
      }).run();
    },

    /**
     * Feed de programadas (Master view). Ordenado por `scheduledAt ASC` (próxima primero).
     * @param {Object} [params={}]
     * @param {number} [params.limit=50]
     * @param {number} [params.offset=0]
     * @returns {Array<{ id: string, title: string, body: string, audience: string, scheduledAt: number, createdBy: string }>}
     */
    listScheduled({ limit = 50, offset = 0 } = {}) {
      return db
        .select({
          id: notifications.id,
          title: notifications.title,
          body: notifications.body,
          audience: notifications.audience,
          scheduledAt: notifications.scheduledAt,
          createdBy: notifications.createdBy,
        })
        .from(notifications)
        .where(eq(notifications.status, 'scheduled'))
        .orderBy(asc(notifications.scheduledAt))
        .limit(limit)
        .offset(offset)
        .all();
    },

    /**
     * Busca una notificación programada por su ID.
     * @param {string} id - UUIDv7.
     * @returns {Object|null} La notificación o null si no existe o ya no está 'scheduled'.
     */
    findScheduledById(id) {
      const row = db
        .select({
          id: notifications.id,
          title: notifications.title,
          body: notifications.body,
          audience: notifications.audience,
          scheduledAt: notifications.scheduledAt,
          status: notifications.status,
          createdBy: notifications.createdBy,
        })
        .from(notifications)
        .where(and(eq(notifications.id, id), eq(notifications.status, 'scheduled')))
        .limit(1)
        .all()[0];
      return row ?? null;
    },

    /**
     * Actualiza campos de una notificación programada. Sólo permite el patch en `status='scheduled'`
     * — protege contra rewrite de publicadas/canceladas. `patch` puede traer title/body/audience/scheduledAt.
     * Devuelve `true` si actualizó alguna fila.
     */
    /**
     * Actualiza campos de una notificación programada. Solo permite patch en status='scheduled'.
     * @param {Object} params
     * @param {string} params.id
     * @param {Object} params.patch - Campos a actualizar (title/body/audience/scheduledAt).
     * @param {number} params.now - Timestamp ms.
     * @returns {boolean} true si se actualizó alguna fila.
     */
    updateScheduled({ id, patch, now }) {
      const fields = { ...patch, updatedAt: now };
      const res = db.update(notifications)
        .set(fields)
        .where(and(eq(notifications.id, id), eq(notifications.status, 'scheduled')))
        .run();
      return res.changes > 0;
    },

    /**
     * Marca una notificación programada como cancelada. Idempotente: solo afecta si status='scheduled'.
     * @param {Object} params
     * @param {string} params.id
     * @param {number} params.now - Timestamp ms.
     * @returns {boolean} true si se canceló alguna fila.
     */
    cancelScheduled({ id, now }) {
      const res = db.update(notifications)
        .set({ status: 'canceled', updatedAt: now })
        .where(and(eq(notifications.id, id), eq(notifications.status, 'scheduled')))
        .run();
      return res.changes > 0;
    },

    /**
     * Transición scheduled → published disparada por el worker: fija `publishedAt` y limpia
     * `scheduledAt` para que la notificación entre al feed. Devuelve la fila publicada (o `null`
     * si ya no estaba en 'scheduled' — carrera con cancel).
     */
    /**
     * Transiciona una notificación de 'scheduled' → 'published'. Fija publishedAt y limpia
     * scheduledAt para que entre al feed de publicadas.
     * @param {Object} params
     * @param {string} params.id
     * @param {number} params.now - Timestamp ms.
     * @returns {Object|null} La fila publicada o null si ya no estaba en 'scheduled'.
     */
    markPublished({ id, now }) {
      const res = db.update(notifications)
        .set({ status: 'published', publishedAt: now, scheduledAt: null, updatedAt: now })
        .where(and(eq(notifications.id, id), eq(notifications.status, 'scheduled')))
        .run();
      if (res.changes === 0) return null;
      const row = db
        .select({
          id: notifications.id,
          title: notifications.title,
          body: notifications.body,
          audience: notifications.audience,
          publishedAt: notifications.publishedAt,
        })
        .from(notifications).where(eq(notifications.id, id)).limit(1).all()[0];
      return row ?? null;
    },
  };
}
