import { describe, it, expect } from 'vitest';
import { diffResources } from '../contract-diff.js';

const oldResource = {
  fields: [
    { id: 'f1', name: 'title', type: 'string' },
    { id: 'f2', name: 'price', type: 'integer' },
    { id: 'f3', name: 'old_col', type: 'string' },
  ],
};
const newResource = {
  fields: [
    { id: 'f1', name: 'name', type: 'string' }, // rename title → name
    { id: 'f2', name: 'price', type: 'float' }, // retype integer → float
    { id: 'f4', name: 'active', type: 'boolean' }, // add
    // f3 ausente → drop
  ],
};

describe('diffResources (por field.id)', () => {
  it('detecta add / rename / retype / drop', () => {
    const d = diffResources(oldResource, newResource);
    expect(d.adds.map((f) => f.name)).toEqual(['active']);
    expect(d.renames).toEqual([{ from: 'title', to: 'name', field: expect.objectContaining({ id: 'f1' }) }]);
    expect(d.retypes).toEqual([{ name: 'price', from: 'integer', to: 'float' }]);
    expect(d.drops.map((f) => f.name)).toEqual(['old_col']);
  });

  it('sin cambios → diff vacío', () => {
    expect(diffResources(oldResource, oldResource)).toEqual({ adds: [], renames: [], retypes: [], drops: [] });
  });
});
