import { uuidv7 } from '../../../common/id.js';

/**
 * P8.2: registra un asset recién subido en el catálogo local del tenant (`assets` table). Se
 * llama desde `upload-dynamic-asset.usecase.js` DESPUÉS del upload OK al CDN. El fallo del
 * INSERT NO tira el upload — el archivo ya está en Cloudinary y la fila del resource dinámico
 * lo referencia por `url`. Loguear + continuar es intencional (best-effort local catalog).
 *
 * Guarda `provider`, `publicId`, `url`, `bytes`, `format`, `mimeType`, `filename` (del upload)
 * más los identificadores de origen: `resourceName`, `fieldName`, `rowId`, `uploadedBy`. Esto
 * permite luego construir el hard-block del delete y filtrar por resource/uploader en la vista.
 *
 * @param {{ assetRepository: object, logger: import('pino').Logger, now?: () => number }} deps
 */
/**
 * @param {Object} deps
 * @param {Object} deps.assetRepository
 * @param {import('pino').Logger} deps.logger
 * @param {() => number} [deps.now]
 * @returns {(params: { provider: string, publicId: string, url: string, bytes: number, format?: string, mimeType?: string, filename?: string, resourceName?: string, fieldName?: string, rowId?: string, uploadedBy?: string }) => void}
 */
export function makeRecordAsset({ assetRepository, logger, now = () => Date.now() }) {
  /**
   * Registra un asset en el catálogo local del tenant después del upload exitoso al CDN.
   * Best-effort: el fallo del INSERT no revierte el upload.
   * @param {Object} params
   * @param {string} params.provider - cloudinary|box.
   * @param {string} params.publicId - ID público devuelto por el CDN.
   * @param {string} params.url - URL pública del asset.
   * @param {number} params.bytes - Tamaño en bytes.
   * @param {string} [params.format] - Extensión del archivo.
   * @param {string} [params.mimeType] - Tipo MIME del archivo.
   * @param {string} [params.filename] - Nombre original del archivo.
   * @param {string} [params.resourceName] - Resource de origen (contrato No-Code).
   * @param {string} [params.fieldName] - Field de tipo asset en el resource.
   * @param {string} [params.rowId] - ID de la fila que referencia el asset.
   * @param {string} [params.uploadedBy] - ID del usuario que subió el archivo.
   * @returns {void}
   */
  return function recordAsset({ provider, publicId, url, bytes, format, mimeType, filename,
    resourceName = null, fieldName = null, rowId = null, uploadedBy = null }) {
    try {
      assetRepository.insert({
        id: uuidv7(),
        provider,
        publicId,
        url,
        bytes,
        format: format ?? null,
        mimeType: mimeType ?? null,
        filename: filename ?? null,
        resourceName,
        fieldName,
        rowId,
        uploadedBy,
        uploadedAt: now(),
        deletedAt: null,
      });
    } catch (err) {
      // El upload ya se realizó — no relanzamos para no confundir al caller. El asset queda
      // "huérfano" del catálogo local pero funcional en el CDN. Job de reconciliación en el
      // futuro puede levantarlos vía Cloudinary Admin API.
      logger.error({ err, publicId, resourceName, fieldName }, '[record-asset] fallo insertando en catálogo local (asset SÍ está en CDN)');
    }
  };
}
