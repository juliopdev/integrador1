/**
 * Fábrica para el caso de uso que provisiona la base de datos física del tenant.
 * Invoca el migrador para crear la base de datos SQLite y poblarla con el esquema inicial.
 *
 * @param {Object} deps - Dependencias inyectadas.
 * @param {(tenantId: string) => string} deps.migrateTenant - Función que ejecuta las migraciones de Drizzle para el tenant.
 * @returns {(params: { tenantId: string }) => Promise<{ tenantId: string, dbPath: string }>}
 */
export function makeProvisionTenantDb({ migrateTenant }) {
  /**
   * Crea la base de datos SQLite del tenant y ejecuta el esquema inicial.
   * @param {Object} params - Parámetros de provisión.
   * @param {string} params.tenantId - ID del tenant.
   * @returns {Promise<{ tenantId: string, dbPath: string }>} Ruta al archivo `.db` creado.
   */
  return async function provisionTenantDb({ tenantId }) {
    const dbPath = migrateTenant(tenantId);
    return { tenantId, dbPath };
  };
}
