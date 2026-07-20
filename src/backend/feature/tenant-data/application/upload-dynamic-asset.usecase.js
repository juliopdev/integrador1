import { DomainError } from '../../../common/errors.js';

// Límites por default — el contrato podría exponerlos por-field más adelante, pero por MVP
// aplicamos estos valores conservadores globales.
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set([
  // imágenes
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif',
  // documentos
  'application/pdf',
  // audio + video (Cloudinary los soporta con `resource_type: auto`)
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/webm',
]);

/**
 * Fábrica para el caso de uso que gestiona la carga de archivos multimedia y documentos (assets) a Cloudinary.
 * Valida restricciones de tamaño máximo (10 MB), tipos MIME soportados y comprueba que el campo de destino
 * en el resource sea efectivamente de tipo asset.
 *
 * @param {Object} deps - Dependencias.
 * @param {Function} deps.resolveAssetStore - Adaptador que inicializa el almacén Cloudinary del tenant.
 * @param {string} deps.tenantId - ID del tenant space.
 * @param {Object} deps.tenantDb - Instancia de Drizzle conectada a la base de datos del tenant.
 * @returns {(params: { resource: Object, fieldName: string, buffer: Buffer, mimeType: string, filename: string }) => Promise<{ url: string, publicId: string, bytes: number, format: string }>} Función de caso de uso.
 */
/**
 * @param {Object} deps
 * @param {Function} deps.resolveAssetStore
 * @param {string} deps.tenantId
 * @param {Object} deps.tenantDb
 * @param {Function} [deps.recordAsset=()=>{}]
 * @returns {(params: { resource: Object, fieldName: string, buffer: Buffer, mimeType: string, filename: string, rowId?: string, uploadedBy?: string }) => Promise<{ url: string, publicId: string, bytes: number, format: string }>}
 */
export function makeUploadDynamicAsset({ resolveAssetStore, tenantId, tenantDb, recordAsset = () => {} }) {
  /**
   * Sube un archivo multimedia al CDN (Cloudinary) validando tamaño (≤10 MB), tipo MIME
   * permitido y que el field destino sea de tipo asset. Registra el asset en el catálogo
   * local best-effort.
   * @param {Object} params
   * @param {Object} params.resource - Definición del resource.
   * @param {string} params.fieldName - Nombre del field de tipo asset.
   * @param {Buffer} params.buffer - Contenido binario del archivo.
   * @param {string} params.mimeType - Tipo MIME del archivo.
   * @param {string} params.filename - Nombre original del archivo.
   * @param {string} [params.rowId] - ID de la fila asociada.
   * @param {string} [params.uploadedBy] - ID del usuario que sube.
   * @returns {Promise<{ url: string, publicId: string, bytes: number, format: string }>}
   * @throws {DomainError} Si el archivo está vacío, excede límite, MIME no permitido,
   *   field no encontrado o no es de tipo asset.
   */
  return async function uploadDynamicAsset({ resource, fieldName, buffer, mimeType, filename, rowId = null, uploadedBy = null }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new DomainError('EMPTY_FILE', 'El archivo está vacío o no llegó correctamente.');
    }
    if (buffer.length > MAX_BYTES) {
      throw new DomainError('FILE_TOO_LARGE', `El archivo supera el límite de ${MAX_BYTES / (1024 * 1024)} MB.`);
    }
    if (!ALLOWED_MIMES.has(String(mimeType))) {
      throw new DomainError('INVALID_MIME', `El tipo de archivo "${mimeType}" no está permitido.`);
    }

    const field = (resource.fields || []).find((f) => f.name === fieldName);
    if (!field) {
      throw new DomainError('FIELD_NOT_FOUND', `El resource "${resource.name}" no contiene el field "${fieldName}".`);
    }
    if (field.type !== 'asset') {
      throw new DomainError('FIELD_NOT_ASSET', `El field "${fieldName}" no es de tipo asset.`);
    }

    // Provider del asset lo dicta el field (`config` del contrato). En MVP soportamos solo
    // `cloudinary`; el use case NO lo hardcodea — `resolveAssetStore` recibe el nombre y decide.
    const provider = field.provider || 'cloudinary';
    const store = await resolveAssetStore({ tenantId, tenantDb, provider });
    // `folder` estable por tenant/resource/field permite auditar y limpiar por scope. `filename`
    // puede usarse a futuro como base del `public_id` si querés URLs más legibles.
    const result = await store.uploadBuffer({
      buffer,
      folder: `${tenantId}/${resource.physicalName}/${fieldName}`,
    });
    // P8.2: registrar en el catálogo local `assets` para la Biblioteca de medios del Master.
    // Best-effort — si falla, el archivo YA está en el CDN y la fila del resource lo referencia
    // por URL. `recordAsset` loguea internamente. Ver `manage-tenant-gallery/application/record-asset.usecase.js`.
    recordAsset({
      provider,
      publicId: result.publicId,
      url: result.url,
      bytes: result.bytes,
      format: result.format,
      mimeType,
      filename,
      resourceName: resource.physicalName,
      fieldName,
      rowId,
      uploadedBy,
    });
    return { url: result.url, publicId: result.publicId, bytes: result.bytes, format: result.format };
  };
}
