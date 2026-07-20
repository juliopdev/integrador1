import { DomainError, NotFoundError } from '../../../common/errors.js';

/**
 * P8.2: borra un asset de la Biblioteca de medios del Master. Hard-block si alguna fila de un
 * resource dinámico referencia el `url` del asset (mismo patrón que unlink-provider). Si nadie
 * lo referencia, ejecuta el destroy en el CDN + soft-delete en el catálogo local. La fila
 * queda en `assets` con `deletedAt` para audit trail.
 *
 * Orden: check referencias → destroy CDN → soft-delete local. Si el destroy del CDN falla, el
 * caller ve el error y NO se soft-deletea local (evita catálogo desincronizado). Si el
 * soft-delete falla tras un destroy OK, el asset queda "huérfano" (removido del CDN pero
 * visible en la galería) — se loguea y el próximo delete lo terminará de limpiar.
 *
 * @param {{
 *   assetRepository: object,
 *   findAssetReferences: (p: { url: string }) => Promise<Array<{ resource: string, field: string, rowId: string }>>,
 *   resolveAssetStore: (p: { provider: string }) => Promise<{ destroy: (publicId: string) => Promise<void> }>,
 *   logger: import('pino').Logger,
 *   now?: () => number,
 * }} deps
 * @throws {NotFoundError} `ASSET_NOT_FOUND`
 * @throws {DomainError} `ASSET_IN_USE`
 */
/**
 * @param {Object} deps
 * @param {Object} deps.assetRepository
 * @param {(p: { url: string }) => Promise<Array<{ resource: string, field: string, rowId: string }>>} deps.findAssetReferences
 * @param {(p: { provider: string }) => Promise<{ destroy: (publicId: string) => Promise<void> }>} deps.resolveAssetStore
 * @param {import('pino').Logger} deps.logger
 * @param {() => number} [deps.now]
 * @returns {(params: { id: string }) => Promise<{ id: string, deleted: boolean }>}
 */
export function makeDeleteAsset({
  assetRepository,
  findAssetReferences,
  resolveAssetStore,
  logger,
  now = () => Date.now(),
}) {
  /**
   * Ejecuta la eliminación de un asset: verifica referencias cruzadas, destruye en CDN y
   * aplica soft-delete local. Si el CDN falla no se toca el catálogo local.
   * @param {Object} params
   * @param {string} params.id - UUIDv7 del asset a eliminar.
   * @returns {Promise<{ id: string, deleted: boolean }>}
   * @throws {NotFoundError} Si el asset no existe o ya fue eliminado.
   * @throws {DomainError} Si el asset está referenciado por filas de resources dinámicos.
   */
  return async function deleteAsset({ id }) {
    const asset = assetRepository.findActiveById(id);
    if (!asset) {
      throw new NotFoundError('ASSET_NOT_FOUND', 'El asset no existe o ya fue eliminado.');
    }

    const references = await findAssetReferences({ url: asset.url });
    if (references.length > 0) {
      const err = new DomainError(
        'ASSET_IN_USE',
        `Este asset lo usan ${references.length} fila(s) de tus resources. Edita o elimina esas filas antes de borrar el archivo.`,
      );
      err.details = { references };
      throw err;
    }

    // Destroy en el CDN. Si falla, el caller ve la excepción; el catálogo local queda intacto.
    const store = await resolveAssetStore({ provider: asset.provider });
    await store.destroy(asset.publicId);

    // Soft-delete local (audit trail). El fallo acá se loguea pero NO se relanza — el CDN ya
    // borró y el asset queda huérfano en la lista; próxima operación lo terminará de limpiar.
    try {
      assetRepository.softDelete({ id: asset.id, now: now() });
    } catch (err) {
      logger.error({ err, id: asset.id, publicId: asset.publicId }, '[delete-asset] destroy en CDN OK pero soft-delete local falló');
    }

    return { id: asset.id, deleted: true };
  };
}
