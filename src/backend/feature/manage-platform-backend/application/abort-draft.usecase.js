/**
 * Aborta ("Reiniciar") el draft del asistente No-Code: restaura `tenant_providers` al snapshot
 * capturado por `start-draft` y luego elimina la fila del draft. El descarte tras publicar es una
 * ruta distinta (`contractRepository.deleteDraft()` a secas) — no debe restaurar providers porque
 * el contrato recién publicado depende de ellos.
 *
 * Semántica del restore (ver `provider-tenant.repository.js#restoreFromSnapshot`):
 *  - Providers presentes en el snapshot → se re-upsertan con la config y `enabled` originales.
 *  - Providers linkeados DURANTE el draft (ausentes del snapshot) → `enabled=0` (las credenciales
 *    quedan almacenadas para relinkeo manual, misma política que el botón "Deslinkear").
 *
 * @param {{ contractRepository: object, providerRepository: object, logger: import('pino').Logger, now?: () => number }} deps
 * @returns {() => Promise<{deleted: boolean, restored: number}>} Función de caso de uso.
 */
export function makeAbortDraft({ contractRepository, providerRepository, logger, now = () => Date.now() }) {
  /**
   * Ejecuta el aborto del draft: restaura providers desde el snapshot y elimina el draft.
   * @returns {Promise<{deleted: boolean, restored: number}>} Resultado: si se eliminó el draft
   *   y cuántos providers se restauraron.
   * @throws {Error} Si el restore del snapshot falla, se relanza para visibilidad del operador.
   */
  return async function abortDraft() {
    const draft = contractRepository.getDraft?.();
    if (!draft) return { deleted: false, restored: 0 };

    const snapshot = Array.isArray(draft.schema?.providersSnapshot) ? draft.schema.providersSnapshot : null;
    let restored = 0;
    if (snapshot && providerRepository?.restoreFromSnapshot) {
      try {
        restored = providerRepository.restoreFromSnapshot(snapshot, now());
      } catch (err) {
        // No dejamos el draft huérfano si el restore falla: logueamos con contexto y RELANZAMOS
        // para que el operador vea el error. Preferimos "no borré el draft y algo falló" a
        // "borré el draft pero el estado quedó a medio restaurar" (más recuperable manualmente).
        logger.error({ err }, '[abort-draft] fallo restaurando snapshot de tenant_providers');
        throw err;
      }
    } else if (!snapshot) {
      // Draft "legacy" (creado antes del snapshotting) — no podemos restaurar, avisamos.
      logger.warn('[abort-draft] draft sin providersSnapshot — se elimina sin restaurar providers (posible drift)');
    }

    contractRepository.deleteDraft(draft.version);
    return { deleted: true, restored };
  };
}
