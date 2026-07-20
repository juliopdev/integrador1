/**
 * Fábrica para el caso de uso que lista los recursos vigentes definidos en el contrato en un formato resumido.
 * Sirve para la carga ágil del menú o index de datos.
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.contractRepository - Repositorio de especificaciones de contratos.
 * @param {function(): (Object|null)} deps.contractRepository.getActiveContract - Resuelve el contrato No-Code publicado.
 * @returns {() => Promise<{ contractVersion: string|null, resources: Array<Object> }>} Función de caso de uso.
 */
/**
 * @param {Object} deps
 * @param {Object} deps.contractRepository
 * @returns {() => Promise<{ contractVersion: string|null, resources: Array<Object> }>}
 */
export function makeListResources({ contractRepository }) {
  /**
   * Lista los resources gestionables del contrato activo con sus endpoints asociados.
   * @returns {Promise<{ contractVersion: string|null, resources: Array<{ name: string, physicalName: string, store: string, fieldsCount: number, endpoints: Array<{ path: string, methods: string[] }> }>}>}
   */
  return async function listResources() {
    const active = contractRepository.getActiveContract();
    if (!active) return { contractVersion: null, resources: [] };

    const endpointsByResource = new Map();
    for (const ep of active.schema.endpoints || []) {
      const list = endpointsByResource.get(ep.resource) || [];
      list.push({ path: ep.path, methods: ep.methods });
      endpointsByResource.set(ep.resource, list);
    }

    const resources = (active.schema.resources || [])
      .filter((r) => r.manageable !== false)
      .map((r) => ({
        name: r.name,
        physicalName: r.physicalName,
        store: r.store,
        fieldsCount: (r.fields || []).length,
        endpoints: endpointsByResource.get(r.name) || [],
      }));

    return { contractVersion: active.version, resources };
  };
}
