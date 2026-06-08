import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import { tenants } from '../../config/drizzle/schema.js';
import { registerTenantDeps } from '../container/di-profiles/tenant.js';
import { asValue } from 'awilix';

/**
 * ES: Middleware de Fastify para resolver dinámicamente el inquilino (Tenant) a través de subdominios
 * o mediante la cabecera HTTP 'x-tenant-id' (clave para facilitar pruebas de integración).
 * Si detecta un inquilino, abre su base de datos y monta un contenedor Awilix scoped con sus dependencias.
 * 
 * EN: Fastify middleware to dynamically resolve the Tenant via subdomains
 * or using the HTTP header 'x-tenant-id' (useful for integration testing).
 * If a tenant is detected, it opens its database and spins up an Awilix scoped container with its dependencies.
 */
export default fp(async (fastify, opts) => {
  fastify.addHook('preHandler', async (req, reply) => {
    const host = req.hostname;
    const parts = host.split('.');
    let subdomain = null;

    // ES: 1. Comprobar cabecera de conveniencia para pruebas de desarrollo.
    // EN: 1. Check convenience header for development/testing environments.
    if (req.headers['x-tenant-id']) {
      subdomain = req.headers['x-tenant-id'];
    } 
    // ES: 2. Resolver subdominio en entornos DNS reales (ej. tenant1.juliopariona.com).
    // EN: 2. Resolve subdomain in real DNS environments (e.g. tenant1.juliopariona.com).
    else if (parts.length > 2 && parts[parts.length - 2] !== 'localhost') {
      subdomain = parts[0];
    } 
    // ES: 3. Resolver subdominio en localhost de desarrollo (ej. tenant1.localhost).
    // EN: 3. Resolve subdomain on local development host (e.g. tenant1.localhost).
    else if (parts.length > 1 && parts[parts.length - 1] === 'localhost') {
      subdomain = parts[0];
    }

    // ES: Normalizar subdominio a minúsculas para evitar miss en búsquedas.
    // EN: Normalize subdomain to lowercase to prevent lookup misses.
    if (subdomain) {
      subdomain = subdomain.toLowerCase();
    }

    // ES: Si no hay subdominio o corresponde a www, mantener contexto global de plataforma.
    // EN: If no subdomain or it matches www, retain the global platform context.
    if (!subdomain || subdomain === 'www') {
      req.tenantContext = null;
      return;
    }

    // ES: Obtener la instancia singleton de la base de datos del sistema.
    // EN: Resolve the system database singleton instance.
    const systemDb = fastify.container.resolve('systemDb');

    // ES: Consultar la existencia del inquilino en la tabla global.
    // EN: Lookup tenant existence in the global database.
    const tenant = await systemDb
      .select()
      .from(tenants)
      .where(eq(tenants.subdomain, subdomain))
      .get();

    // ES: Retornar 404 si el inquilino no existe.
    // EN: Return 404 if tenant does not exist.
    if (!tenant) {
      const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
      const isApi = req.url.startsWith('/api/') || req.url.startsWith('/api-system/');

      reply.status(404);
      if (isApi || !acceptsHtml) {
        return reply.send({
          statusCode: 404,
          error: 'Not Found',
          message: `Tenant with subdomain "${subdomain}" not found / Inquilino no encontrado`,
        });
      }
      return reply.view('backend/common/templates/_404.ejs', { title: 'Inquilino No Encontrado' });
    }

    // ES: Bloquear accesos a inquilinos suspendidos.
    // EN: Restrict access for suspended tenants.
    if (tenant.status !== 'active') {
      reply.status(403);
      return reply.send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Tenant "${subdomain}" is suspended / Inquilino suspendido`,
      });
    }

    // ES: Reutilizar el scope de request existente y registrar dependencias del tenant.
    // EN: Reuse the existing request scope and register tenant dependencies.
    registerTenantDeps(req.scope, tenant.id);
    req.scope.register({
      tenant: asValue(tenant),
    });

    // ES: Guardar el contexto del inquilino en la request.
    // EN: Store the tenant context in the request.
    req.tenantContext = tenant;
  });
}, { name: 'tenant-loader' });