import { DomainError } from '../../../common/errors.js';

/**
 * Paso 1 del asistente v2 (PLAN-ux2 P7 / no-code.md §5): inicia el borrador eligiendo el modo.
 * - `edit`: el draft nace del contrato publicado y re-publica la MISMA versión (hot-fix).
 * - `upgrade`: crea el snapshot v(N+1) partiendo del publicado (o el esqueleto v1 si no hay).
 * El modo queda persistido en `schema_json.versionMode`; con un draft en curso el modo no se
 * cambia (Reiniciar primero) — evita mezclar semánticas a mitad de composición.
 *
 * Además captura un **snapshot** de `tenant_providers` en `schema.providersSnapshot`. Esto permite
 * al operador linkear proveedores DURANTE el draft y, si luego "Reinicia", que `abort-draft.usecase.js`
 * restaure `tenant_providers` al estado que tenía cuando arrancó el draft (sin efectos secundarios
 * persistentes). Ver el análisis del bug en `.doc/rules/no-code.md`.
 *
 * @param {{ contractRepository: object, providerRepository: object, now?: () => number }} deps
 * @returns {(params: { mode: string }) => Promise<{version: string, mode: string, existing: boolean}>} Función de caso de uso.
 * @throws {DomainError} `DRAFT_IN_PROGRESS` | `NO_PUBLISHED_CONTRACT`
 */
export function makeStartDraft({ contractRepository, providerRepository, now = () => Date.now() }) {
  /**
   * Inicia un borrador del asistente No-Code en modo edit o upgrade.
   * @param {Object} params
   * @param {string} params.mode - Modo del draft ("edit" | "upgrade").
   * @returns {Promise<{version: string, mode: string, existing: boolean}>} Datos del draft iniciado.
   * @throws {DomainError} DRAFT_IN_PROGRESS | NO_PUBLISHED_CONTRACT
   */
  return async function startDraft({ mode }) {
    const existing = contractRepository.getDraft();
    if (existing) {
      const currentMode = existing.schema?.versionMode ?? null;
      if (currentMode === mode) {
        return { version: existing.version, mode, existing: true }; // idempotente
      }
      throw new DomainError('DRAFT_IN_PROGRESS', 'Ya hay un borrador en curso con otro modo. Reinícialo para cambiar entre editar y upgradear.');
    }

    const published = contractRepository.getActiveContract();
    if (mode === 'edit' && !published) {
      throw new DomainError('NO_PUBLISHED_CONTRACT', 'No hay una versión publicada para editar — usa "Upgradear" para crear la primera.');
    }

    // Snapshot antes de crear el draft. Guardar `[]` si no hay providers (arranque limpio) — así
    // el abort restaura a "sin providers linkeados", que también es un estado válido.
    const providersSnapshot = providerRepository?.snapshot ? providerRepository.snapshot() : [];

    let version;
    let schema;
    if (mode === 'edit') {
      version = published.version;
      schema = { ...published.schema, versionMode: 'edit', providersSnapshot };
    } else {
      const n = published ? Number(String(published.version).replace(/^v/, '')) : 0;
      version = `v${(Number.isFinite(n) ? n : 0) + 1}`;
      schema = published
        ? { ...published.schema, version, versionMode: 'upgrade', providersSnapshot }
        : {
            version,
            versionMode: 'upgrade',
            providersSnapshot,
            stores: {},
            resources: [],
            endpoints: [],
            auth: { userAuthEnabled: false, strategies: [], redirectUris: [] },
            websocket: { channels: [] },
          };
    }

    contractRepository.saveDraft({ version, schemaJson: JSON.stringify(schema), now: now() });
    return { version, mode, existing: false };
  };
}
