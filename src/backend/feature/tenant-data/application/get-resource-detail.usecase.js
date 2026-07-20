/**
 * Fábrica para el caso de uso que obtiene la definición en detalle de una resource (su esquema de campos y endpoints API relacionados).
 * Recupera la información a partir del contrato No-Code activo.
 *
 * @param {Object} deps - Dependencias.
 * @param {Object} deps.contractRepository - Repositorio para la consulta de especificaciones no-code.
 * @param {function(): (Object|null)} deps.contractRepository.getActiveContract - Método para resolver el contrato de no-code vigente del tenant.
 * @returns {(params: { name: string }) => Promise<Object|null>} Función de caso de uso.
 */
/**
 * @param {Object} deps
 * @param {Object} deps.contractRepository
 * @param {function(): (Object|null)} deps.contractRepository.getActiveContract
 * @returns {(params: { name: string }) => Promise<Object|null>}
 */
export function makeGetResourceDetail({ contractRepository }) {
  /**
   * Obtiene la definición completa de un resource (schema de campos + endpoints) desde el contrato activo.
   * @param {Object} params
   * @param {string} params.name - Nombre del resource (ej: "productos").
   * @returns {Promise<Object|null>} Detalle del resource o null si no existe.
   */
  return async function getResourceDetail({ name }) {
    const active = contractRepository.getActiveContract();
    if (!active) return null;
    const resource = (active.schema.resources || []).find((r) => r.name === name);
    if (!resource) return null;

    const endpoints = (active.schema.endpoints || [])
      .filter((ep) => ep.resource === name)
      .map((ep) => ({ path: ep.path, methods: ep.methods }));

    // Normaliza `required` a booleano (el contrato lo trae opcional; el UI espera el valor puro).
    const fields = (resource.fields || []).map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      required: Boolean(f.required),
      ...(f.provider ? { provider: f.provider } : {}),
      ...(f.target ? { target: f.target } : {}),
    }));

    return {
      contractVersion: active.version,
      name: resource.name,
      physicalName: resource.physicalName,
      store: resource.store,
      fields,
      endpoints,
    };
  };
}
