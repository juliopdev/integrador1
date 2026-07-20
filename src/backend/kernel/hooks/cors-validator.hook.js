import { env } from '../../config/env.js';
import { ForbiddenError } from '../../common/errors.js';

const BASE_DOMAIN = new URL(env.APP_URL).hostname;

/** Normaliza y compara dos hostnames para permitir coincidencia exacta o diferencias de www. */
/**
 * Compara y normaliza dos hostnames de origen y destino para validar si coinciden (ignorando diferencias por 'www.').
 * 
 * @param {string|undefined} originHost - Hostname de origen a contrastar.
 * @param {string|undefined} allowedHost - Hostname permitido en la configuración.
 * @returns {boolean} `true` si coinciden (directo o con prefijo www), de lo contrario `false`.
 */
function matchHostname(originHost, allowedHost) {
  if (!originHost || !allowedHost) return false;
  const o = originHost.toLowerCase();
  const a = allowedHost.toLowerCase();
  return o === a || o === `www.${a}` || `www.${o}` === a;
}

/**
 * Registra el hook `onRequest` para validar dinámicamente el origen de solicitudes CORS (Cross-Origin Resource Sharing).
 * Autoriza peticiones provenientes del subdominio del tenant resuelto, sus dominios personalizados de marca blanca y localhost (en desarrollo/test).
 * 
 * @param {import('fastify').FastifyInstance} app - Instancia del servidor Fastify.
 */
export function registerCorsValidator(app) {
  app.addHook('onRequest', async (request) => {
    const origin = request.headers.origin;
    if (!origin) return; // No es petición CORS/cross-origin
    if (!request.tenant) return; // Petición al apex/superadmin, omitir

    let originHost;
    try {
      originHost = new URL(origin).hostname;
    } catch {
      throw new ForbiddenError('CORS_NOT_ALLOWED', 'El origen proporcionado no es válido.');
    }

    // Permitir desarrollo local
    if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
      if (originHost === 'localhost' || originHost === '127.0.0.1') {
        return;
      }
    }

    // 1. Dominio base del subdominio del tenant (ej. tienda.juliopariona.com)
    const tenantSubdomainHost = `${request.tenant.subdomain}.${BASE_DOMAIN}`;
    if (matchHostname(originHost, tenantSubdomainHost)) {
      return;
    }

    // 2. Dominio personalizado registrado en frontend_deploys (marca blanca)
    if (request.tenant.externalUrl) {
      try {
        const allowedCustomHost = new URL(request.tenant.externalUrl).hostname;
        if (matchHostname(originHost, allowedCustomHost)) {
          return;
        }
      } catch {
        // Ignorar URL externa malformada configurada en el deploy
      }
    }

    // Rechazar orígenes no permitidos
    throw new ForbiddenError('CORS_NOT_ALLOWED', 'El origen de la solicitud no está autorizado.');
  });
}
