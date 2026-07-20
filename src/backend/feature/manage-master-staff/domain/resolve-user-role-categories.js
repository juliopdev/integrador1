import { eq } from 'drizzle-orm';
import { roles, userRoles } from '../../../config/drizzle/schema-tenant.js';

/**
 * Resuelve las categorías y permisos de staff de un usuario en el tenant actual.
 * Extraído de `resolveDashboardChrome` para aislar el acceso a DB del kernel.
 *
 * @param {Object} deps - Dependencias de conexión.
 * @param {import('drizzle-orm').DrizzleD1Database} deps.db - Conexión de Drizzle al tenant DB.
 * @param {string} userId - ID del usuario autenticado.
 * @returns {{ categories: string[], category: 'master'|'staff'|null, isSupport: boolean }} Categorías y flag de soporte.
 * @example
 * resolveUserRoleCategories({ db: tenantDb }, 'user_abc123')
 * // { categories: ['staff'], category: 'staff', isSupport: false }
 */
export function resolveUserRoleCategories({ db }, userId) {
  const rows = db
    .select({ category: roles.category, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId))
    .all();

  const categories = rows.map((r) => r.category);
  let category = null;
  if (categories.includes('master')) category = 'master';
  else if (categories.includes('staff')) category = 'staff';

  const isSupport = rows.some((r) => r.name === 'support');

  return { categories, category, isSupport };
}
