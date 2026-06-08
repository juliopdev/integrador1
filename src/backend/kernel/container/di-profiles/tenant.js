import { asValue } from 'awilix';
import { getTenantDb } from '../../../config/database.js';

/**
 * ES: Perfil de Registro de Dependencias del Inquilino (Tenant Scoped).
 * Resuelve e inyecta dinámicamente la base de datos de SQLite específica para el inquilino solicitado.
 * 
 * EN: Tenant Scoped Dependency Registration Profile.
 * Resolves and dynamically injects the SQLite database instance specific to the requested tenant.
 * 
 * @param {import('awilix').AwilixContainer} scopedContainer - ES: Contenedor secundario scoped. EN: Scoped child container.
 * @param {string} tenantId - ES: Identificador único del inquilino. EN: Tenant unique identifier.
 */
export function registerTenantDeps(scopedContainer, tenantId) {
  const tenantDb = getTenantDb(tenantId);

  scopedContainer.register({
    // ES: Identificador de inquilino disponible en el contexto de la petición.
    // EN: Tenant identifier made available within the request scope.
    tenantId: asValue(tenantId),

    // ES: Conexión de base de datos dedicada inyectada al scope actual de ejecución.
    // EN: Dedicated database connection injected to the current scope of execution.
    tenantDb: asValue(tenantDb),
  });
}
