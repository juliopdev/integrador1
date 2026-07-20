import { describe, it, expect } from 'vitest';
import { buildOpenApi } from '../openapi.builder.js';

const contract = {
  version: 'v1',
  resources: [{
    name: 'products', physicalName: 'products_db',
    fields: [{ id: 'f1', name: 'title', type: 'string', required: true }, { id: 'f2', name: 'price', type: 'integer' }],
  }],
  endpoints: [{ path: '/products', resource: 'products', methods: ['GET', 'POST', 'PUT', 'DELETE'] }],
};

describe('buildOpenApi', () => {
  it('genera OpenAPI 3.1 con paths y schemas del contrato', () => {
    const doc = buildOpenApi(contract);
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('v1');
    expect(doc.paths['/products'].get).toBeDefined();
    expect(doc.paths['/products'].post).toBeDefined();
    expect(doc.paths['/products/{id}'].put).toBeDefined();
    expect(doc.paths['/products/{id}'].delete).toBeDefined();

    const schema = doc.components.schemas.products;
    expect(schema.properties.title).toEqual({ type: 'string' });
    expect(schema.properties.price).toEqual({ type: 'integer', format: 'int64' });
    expect(schema.required).toContain('title');
    expect(schema.properties).toHaveProperty('created_at');
  });

  it('respeta los métodos del endpoint (solo GET → sin POST/PUT)', () => {
    const doc = buildOpenApi({ ...contract, endpoints: [{ path: '/products', resource: 'products', methods: ['GET'] }] });
    expect(doc.paths['/products'].post).toBeUndefined();
    expect(doc.paths['/products/{id}'].put).toBeUndefined();
  });
});
