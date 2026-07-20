import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq, isNull } from 'drizzle-orm';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { env } from '../../config/env.js';
import { platformDb } from '../../config/database/platform/sqlite-platform.js';
import { tenants, frontendDeploys } from '../../config/drizzle/schema-platform.js';
import { tenantPool } from '../../config/database/connection-pool/lru-manager.js';
import { getJson, setJson } from '../../infrastructure/providers/cache-core.adapter.js';
import { AppError, NotFoundError } from '../../common/errors.js';

const BASE_DOMAIN = new URL(env.APP_URL).hostname;
const CACHE_TTL_S = 60;
/** Clave Valkey de la resolución por subdominio. Exportada para que los casos de uso que muten el
 *  estado del tenant (suspend/reactivate/soft-delete) invaliden la misma clave que este hook usa. */
export const tenantCacheKey = (sub) => `tenant:sub:${sub}`;
const cacheKey = tenantCacheKey;

/**
 * @typedef {Object} TenantContext
 * @property {string} id - Identificador único del tenant en SQLite.
 * @property {string} subdomain - Subdominio del tenant resuelto.
 * @property {string|null} externalUrl - URL externa del frontend del tenant si está configurada.
 */

/**
 * Registra el hook global `onRequest` en Fastify para la resolución dinámica de tenants.
 * Inspecciona la cabecera `host` de la solicitud entrante; si detecta un subdominio válido,
 * consulta la base de datos de plataforma (o la caché de Valkey) para resolver el tenant.
 * Si está activo, decora el objeto de solicitud con `request.tenant` (datos del tenant) y
 * `request.db` (instancia de Drizzle conectada a su base de datos SQLite específica).
 * 
 * Lanza error 404 si el tenant no existe o está en estado 'pending'.
 * Lanza error 503 si el tenant está en estado 'suspended'.
 * 
 * @param {import('fastify').FastifyInstance} app - Instancia de Fastify.
 */
export function registerTenantLoader(app) {
  if (!app.hasRequestDecorator('tenant')) app.decorateRequest('tenant', null);
  if (!app.hasRequestDecorator('db')) app.decorateRequest('db', null);

  app.addHook('onRequest', async (request) => {
    const subdomain = subdomainOf(request.headers.host);
    if (!subdomain) return; // apex → contexto plataforma

    const tenant = await resolveTenant(subdomain);
    if (!tenant || tenant.status === 'pending') {
      throw new NotFoundError('TENANT_NOT_FOUND', 'No existe un sitio en este subdominio.');
    }
    if (tenant.status === 'suspended') {
      throw new AppError(503, 'TENANT_SUSPENDED', 'Este sitio está temporalmente suspendido.');
    }

    request.tenant = {
      id: tenant.id,
      subdomain,
      externalUrl: tenant.externalUrl,
      frontendMode: tenant.frontendMode || null,
      extractedPath: tenant.extractedPath || null,
    };
    request.db = drizzle(tenantPool.get(tenant.id));
  });
}

/**
 * Extrae y retorna el subdominio de un nivel a partir del encabezado `host` de la solicitud.
 * Si el host es idéntico al dominio base, a 'www' o no es un subdominio directo de un nivel, retorna `null`.
 * 
 * @param {string|undefined} hostHeader - Encabezado `host` recibido en la petición HTTP.
 * @returns {string|null} El subdominio de primer nivel extraído, o `null` si es el dominio raíz (apex) o inválido.
 */
export function subdomainOf(hostHeader) {
  const host = String(hostHeader ?? '').split(':')[0].toLowerCase();
  if (!host || host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return null;
  if (!host.endsWith(`.${BASE_DOMAIN}`)) return null;
  const sub = host.slice(0, -(BASE_DOMAIN.length + 1));
  return sub.includes('.') ? null : sub;
}

/**
 * Resuelve y recupera los metadatos de un tenant buscando en Valkey o directamente en SQLite de plataforma.
 * Cachea el resultado únicamente si el tenant se encuentra en estado 'active'.
 * 
 * @param {string} subdomain - Subdominio del tenant a consultar.
 * @returns {Promise<Object|null>} Objeto con las propiedades del tenant (id, status, externalUrl) o null si no se encuentra.
 */
async function resolveTenant(subdomain) {
  const cached = await getJson(cacheKey(subdomain));
  if (cached) return cached;

  const row = platformDb
    .select({
      id: tenants.id,
      status: tenants.status,
      externalUrl: frontendDeploys.externalUrl,
      frontendMode: frontendDeploys.mode,
      extractedPath: frontendDeploys.extractedPath,
    })
    .from(tenants)
    .leftJoin(frontendDeploys, eq(frontendDeploys.tenantId, tenants.id))
    .where(and(eq(tenants.subdomain, subdomain), isNull(tenants.deletedAt)))
    .limit(1)
    .all()[0];
  if (!row) return null;
  if (row.status === 'active') await setJson(cacheKey(subdomain), row, CACHE_TTL_S); // solo activos
  return row;
}
