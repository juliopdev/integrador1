import { v2 as defaultCloudinary } from 'cloudinary';
import { AppError } from '../../common/errors.js';

// Adapter para Cloudinary — cierra el eje de storage del contrato No-Code (tenant-data slice 5).
// Cada tenant provee su propia URI en `tenant_providers` category=storage provider=cloudinary,
// misma disciplina que Neon/Mongo. Ver `.doc/tree/src/backend/feature/tenant-data.md`.
//
// URI: `cloudinary://<api_key>:<api_secret>@<cloud_name>`.

const URI_RE = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/;

/**
 * Parsea una URI de Cloudinary y extrae sus credenciales.
 * Lanza un error si la estructura es inválida o no cuenta con los parámetros básicos.
 * 
 * @param {string} uri - URI del proveedor en formato `cloudinary://KEY:SECRET@CLOUD_NAME`.
 * @returns {{ cloudName: string, apiKey: string, apiSecret: string }} Credenciales extraídas del proveedor.
 * @throws {AppError} Si el formato es inválido.
 */
export function parseCloudinaryUri(uri) {
  const m = URI_RE.exec(String(uri ?? ''));
  if (!m) throw new AppError(400, 'INVALID_CLOUDINARY_URI', 'URI de Cloudinary con formato inválido. Esperado cloudinary://KEY:SECRET@CLOUD_NAME.');
  const [, apiKey, apiSecret, cloudName] = m;
  if (!cloudName) throw new AppError(400, 'INVALID_CLOUDINARY_URI', 'URI de Cloudinary sin cloud_name.');
  return { cloudName, apiKey, apiSecret };
}

/**
 * @typedef {Object} CloudinaryStore
 * @property {function({ buffer: Buffer, folder: string, publicId?: string }): Promise<Object>} uploadBuffer - Sube un buffer de datos binarios al storage y retorna la información estructurada del asset subido.
 * @property {function(string): Promise<Object>} destroy - Elimina un recurso del almacenamiento usando su identificador único publicId.
 */

/**
 * Crea e inicializa una instancia del almacenamiento Cloudinary configurada para un tenant a partir de su URI.
 *
 * @param {string} uri - URI de conexión cifrada del proveedor del tenant.
 * @param {Object} [opts] - Opciones opcionales de configuración.
 * @param {Object} [opts.sdk=defaultCloudinary] - Instancia de desarrollo o SDK real de Cloudinary.
 * @returns {CloudinaryStore} Instancia del almacén configurada para operar.
 */
export function createCloudinaryStore(uri, { sdk = defaultCloudinary } = {}) {
  const { cloudName, apiKey, apiSecret } = parseCloudinaryUri(uri);
  sdk.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

  return {
    /**
     * Sube un buffer con `upload_stream`. Devuelve el shape `{ publicId, url, format, bytes,
     * width, height }`. `resource_type: 'auto'` deja que Cloudinary detecte imagen/video/raw.
     * `folder` organiza los assets por tenant + resource + field.
     *
     * @param {{ buffer: Buffer, folder: string, publicId?: string }} params - Parámetros de subida.
     * @param {Buffer} params.buffer - Contenido binario del archivo a subir.
     * @param {string} params.folder - Carpeta de destino (tenant + resource + field).
     * @param {string} [params.publicId] - ID público opcional para el asset.
     * @returns {Promise<{ publicId: string, url: string, format: string, bytes: number, width: number, height: number }>}
     */
    async uploadBuffer({ buffer, folder, publicId }) {
      return new Promise((resolve, reject) => {
        const options = { folder, resource_type: 'auto', ...(publicId ? { public_id: publicId } : {}) };
        const stream = sdk.uploader.upload_stream(options, (err, result) => {
          if (err) return reject(err);
          resolve({
            publicId: result.public_id,
            url: result.secure_url,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
          });
        });
        stream.end(buffer);
      });
    },

    /**
     * Borra un asset de Cloudinary por su `publicId`.
     *
     * @param {string} publicId - ID público del asset a eliminar.
     * @returns {Promise<object>} Resultado de la operación de destrucción de Cloudinary.
     */
    async destroy(publicId) {
      return sdk.uploader.destroy(publicId);
    },
  };
}
