import { DomainError } from '../../../common/errors.js';

/**
 * Activa una versión existente del contrato — rollback / roll-forward entre snapshots ya
 * publicados. Reutiliza el `publishContract` porque el mecanismo es idéntico: retirar el
 * publicado actual + marcar la versión pedida como publicada + re-ejecutar DDL idempotente
 * (`ADD COLUMN IF NOT EXISTS` para reintroducir campos, drops ignorados al bajar de versión).
 *
 * El diseño de "rollback sin pérdida de datos" está documentado en no-code.md §5 (Versionado:
 * contrato vs datos). Este use case es la puerta de entrada UI a ese mecanismo.
 *
 * Errores:
 *   - VERSION_NOT_FOUND: la versión pedida no existe en `backend_contracts`.
 *   - ALREADY_ACTIVE: la versión pedida ya es la publicada (op sin efecto → mejor fallar rápido
 *     que confundir al operador con una "activación" que no hizo nada).
 *
 * @param {{ contractRepository: object, publishContract: Function }} deps
 * @returns {(params: { version: string }) => Promise<{version: string, previousVersion: string|null}>} Función de caso de uso.
 */
export function makeActivateVersion({ contractRepository, publishContract }) {
  /**
   * Activa una versión existente del contrato (rollback/roll-forward).
   * @param {Object} params
   * @param {string} params.version - Versión a activar (ej. "v2").
   * @returns {Promise<{version: string, previousVersion: string|null}>} Versión activada y
   *   versión anterior (null si no había publicado).
   * @throws {DomainError} VERSION_NOT_FOUND | ALREADY_ACTIVE
   */
  return async function activateVersion({ version }) {
    const row = contractRepository.getByVersion(version);
    if (!row) {
      throw new DomainError('VERSION_NOT_FOUND', `No existe la versión ${version} en el historial.`);
    }
    const active = contractRepository.getActiveContract();
    if (active && active.version === version) {
      throw new DomainError('ALREADY_ACTIVE', `La versión ${version} ya está publicada.`);
    }
    // El `schema_json` que se guardó al publicar es el contrato validado — no re-validar acá
    // sería un skip; validar de nuevo en `publishContract` es lo correcto (defensa contra
    // corrupción o esquemas de una versión anterior del validador).
    const contract = JSON.parse(row.schemaJson);
    const { version: activated } = await publishContract({ contract });
    return { version: activated, previousVersion: active ? active.version : null };
  };
}
