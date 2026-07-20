import { eq } from 'drizzle-orm';
import { roles, userRoles } from '../../config/drizzle/schema-tenant.js';
import { AuthError, ForbiddenError } from '../../common/errors.js';

/**
 * Crea un guard de autorización `preHandler` basado en la categoría del rol del usuario.
 * Realiza una verificación dinámica contra la base de datos del tenant consultando la categoría del rol asignado.
 * Lanza un error si el usuario no tiene una categoría coincidente.
 *
 * @param {...('master'|'staff'|'user')} allowed - Categorías autorizadas para acceder a la ruta.
 * @returns {(request: import('fastify').FastifyRequest) => Promise<void>} Guard `preHandler` de Fastify.
 * @throws {AuthError} `UNAUTHENTICATED` si el usuario no ha iniciado sesión.
 * @throws {ForbiddenError} `FORBIDDEN` si se ejecuta fuera del contexto de tenant o si el rol no tiene permisos.
 */
export function requireCategory(...allowed) {
  return async function rbacGuard(request) {
    if (!request.user) throw new AuthError('UNAUTHENTICATED', 'No autenticado.');
    if (!request.db) throw new ForbiddenError('FORBIDDEN', 'Acción no disponible en este contexto.');

    const cats = request.db
      .select({ category: roles.category })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, request.user.id))
      .all()
      .map((r) => r.category);

    if (!cats.some((c) => allowed.includes(c))) {
      throw new ForbiddenError('FORBIDDEN', 'No tienes permiso para esta acción.');
    }
  };
}
