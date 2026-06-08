import { createContainer } from 'awilix';
import { registerSystemDeps } from './di-profiles/system.js';
import { registerTenantDeps } from './di-profiles/tenant.js';

/**
 * ES: Contenedor global raíz de Inversión de Control (IoC) gestionado por Awilix.
 * Almacena las dependencias transversales a toda la plataforma.
 * 
 * EN: Global root Inverse of Control (IoC) container managed by Awilix.
 * Stores cross-cutting dependencies across the entire platform.
 * 
 * @type {import('awilix').AwilixContainer}
 */
const container = createContainer();

// ES: Cargar e inyectar dependencias globales de nivel de sistema (Singletons).
// EN: Load and inject system-level global dependencies (Singletons).
registerSystemDeps(container);

/**
 * ES: Crea un contenedor secundario (Scope) para un inquilino específico, inyectando
 * la conexión correspondiente a su base de datos aislada y su ID de inquilino.
 * 
 * EN: Creates a child container (Scope) for a specific tenant, injecting the
 * connection corresponding to its isolated database and its tenant ID.
 * 
 * @param {string} tenantId - ES: Identificador único del inquilino. EN: Tenant unique identifier.
 * @returns {import('awilix').AwilixContainer} - ES: Contenedor scoped de Awilix. EN: Scoped Awilix container.
 */
export function createTenantScope(tenantId) {
  const scoped = container.createScope();
  registerTenantDeps(scoped, tenantId);
  return scoped;
}

export default container;
