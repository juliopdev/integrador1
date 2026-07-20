import { env } from '../config/env.js';

/**
 * @typedef {Object} DashboardChrome
 * @property {Object|null} user - Datos del usuario autenticado actual.
 * @property {Object|null} tenant - Información del tenant resuelto en SQLite.
 * @property {string} brandTitle - Título de la marca dinámico resuelto para cabecera/sidebar según el rol y tenant.
 * @property {'master'|'staff'|null} category - Categoría/Rol de staff resuelto del usuario en el tenant actual.
 * @property {boolean} isSupport - Indica si el usuario es miembro activo de soporte.
 * @property {string} activePath - Ruta activa de primer nivel en el sidebar para control de navegación.
 * @property {string} currentPath - URL exacta de la solicitud sin parámetros query (para control de breadcrumbs).
 * @property {string} supportEmail - Dirección de correo de soporte técnico global.
 * @property {string} supportWhatsapp - Contacto de mensajería rápida de soporte.
 */

/**
 * Resuelve y compila los metadatos visuales del "chrome" del layout del dashboard compartido por las páginas SSR.
 * Centraliza la lógica de determinación del menú del sidebar, marca dinámica y canales de soporte técnico.
 *
 * @param {import('fastify').FastifyRequest} request - Petición Fastify que expone el usuario y el contexto de base de datos.
 * @param {Object} [opts] - Opciones opcionales de renderizado de la interfaz.
 * @param {string} [opts.activePath='/dashboard'] - Ruta principal a resaltar visualmente en el menú lateral.
 * @param {{ category: ('master'|'staff'|null), isSupport: boolean }|null} [opts.userRoleCategories] - Resultado pre-resuelto de `resolveUserRoleCategories` (inyectado desde el composition root).
 * @returns {DashboardChrome} Objeto con las propiedades resueltas para inyectar en las plantillas EJS del dashboard.
 */
export function resolveDashboardChrome(request, { activePath = '/dashboard', userRoleCategories } = {}) {
  const currentPath = String(request.url || '/').split('?')[0];
  let category = null;
  let isSupport = false;

  if (request.tenant && userRoleCategories) {
    category = userRoleCategories.category;
    isSupport = userRoleCategories.isSupport;
  }

  let brandTitle = 'Mi Baas';
  if (request.tenant) {
    brandTitle = category === 'master' ? `Mi web ${request.tenant.subdomain}` : request.tenant.subdomain;
  }

  const supportEmail = env.SUPPORT_EMAIL || '';
  const supportWhatsapp = env.SUPPORT_WHATSAPP || '';

  // P8.2: capabilities pre-computadas por el hook `tenant-capabilities.hook.js` (bootstrap-tenant).
  // El sidebar las lee para decidir qué links del Master mostrar (Biblioteca de medios, etc.).
  const capabilities = request.tenantCapabilities || {};

  return {
    user: request.user, tenant: request.tenant,
    brandTitle, category, isSupport, activePath, currentPath,
    supportEmail, supportWhatsapp,
    hasStorageProvider: Boolean(capabilities.hasStorageProvider),
    hasAuthProvider: Boolean(capabilities.hasAuthProvider),
    hasDatabaseProvider: Boolean(capabilities.hasDatabaseProvider),
  };
}
