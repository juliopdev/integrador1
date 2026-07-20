// Genera el contrato OpenAPI 3.1 a partir del contrato No-Code (no-code.md). Es el artefacto que
// valida/consume el front; se sirve en `/api/:version/openapi.json` por el dispatcher.

const TYPE_OPENAPI = {
  string: { type: 'string' },
  text: { type: 'string' },
  integer: { type: 'integer', format: 'int64' },
  float: { type: 'number' },
  boolean: { type: 'boolean' },
  date: { type: 'string', format: 'date' },
  datetime: { type: 'string', format: 'date-time' },
  json: {},
  asset: { type: 'string' },
  relation: { type: 'string' },
};

function resourceSchema(resource) {
  const properties = { id: { type: 'string' } };
  for (const f of resource.fields) properties[f.name] = TYPE_OPENAPI[f.type] ?? {};
  properties.created_at = { type: 'integer', format: 'int64' };
  properties.updated_at = { type: 'integer', format: 'int64' };
  properties.deleted_at = { type: 'integer', format: 'int64', nullable: true };
  return { type: 'object', properties, required: resource.fields.filter((f) => f.required).map((f) => f.name) };
}

/**
 * Genera un documento OpenAPI 3.1 a partir del contrato No-Code validado.
 * Sirve como artefacto que el frontend consume en `/api/:version/openapi.json`.
 *
 * @param {object} contract - Contrato validado (`schema_json`) con `version`, `resources` y `endpoints`.
 * @param {string} contract.version - Versión del contrato (ej. "v1").
 * @param {Array} contract.resources - Lista de resources del contrato.
 * @param {Array} contract.endpoints - Lista de endpoints con `path`, `resource`, `methods`.
 * @returns {object} Documento OpenAPI 3.1 con `info`, `paths` y `components.schemas`.
 * @example
 * buildOpenApi({ version: 'v1', resources: [{ name: 'posts', fields: [{ name: 'title', type: 'string', required: true }] }], endpoints: [{ path: '/posts', resource: 'posts', methods: ['GET', 'POST'] }] })
 * // → { openapi: '3.1.0', info: { title: 'API No-Code v1', version: 'v1' }, paths: { ... }, components: { schemas: { ... } } }
 */
export function buildOpenApi(contract) {
  const schemas = {};
  for (const r of contract.resources) schemas[r.name] = resourceSchema(r);

  const paths = {};
  for (const ep of contract.endpoints) {
    const ref = { $ref: `#/components/schemas/${ep.resource}` };
    const jsonBody = { content: { 'application/json': { schema: ref } } };

    const collection = {};
    if (ep.methods.includes('GET')) {
      collection.get = { summary: `Listar ${ep.resource}`, responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: ref } } } } } };
    }
    if (ep.methods.includes('POST')) {
      collection.post = { summary: `Crear ${ep.resource}`, requestBody: { required: true, ...jsonBody }, responses: { 201: { description: 'Creado', ...jsonBody } } };
    }
    if (Object.keys(collection).length) paths[ep.path] = collection;

    const item = {};
    if (ep.methods.includes('GET')) item.get = { summary: `Obtener ${ep.resource}`, responses: { 200: { description: 'OK', ...jsonBody }, 404: { description: 'No encontrado' } } };
    if (ep.methods.includes('PUT')) item.put = { summary: `Actualizar ${ep.resource}`, requestBody: jsonBody, responses: { 200: { description: 'OK', ...jsonBody } } };
    if (ep.methods.includes('DELETE')) item.delete = { summary: `Eliminar ${ep.resource}`, responses: { 200: { description: 'Eliminado' } } };
    if (Object.keys(item).length) {
      paths[`${ep.path}/{id}`] = { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], ...item };
    }
  }

  return {
    openapi: '3.1.0',
    info: { title: `API No-Code ${contract.version}`, version: contract.version },
    paths,
    components: { schemas },
  };
}
