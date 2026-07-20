// Diff de campos entre dos versiones de una resource, mapeando **por `field.id`** (no por `name`),
// para distinguir un renombrado (mismo id, name distinto) de un drop+add. Ver no-code.md.

/**
 * Calcula el diff de campos entre dos versiones de una resource, mapeando por `field.id` (no por `name`).
 * Esto permite distinguir un renombrado (mismo id, name distinto) de un drop+add.
 *
 * @param {object} oldResource - Resource del contrato anterior (con `fields`).
 * @param {object} newResource - Resource del contrato nuevo (mismo `physicalName`).
 * @returns {{ adds: object[], renames: { from: string, to: string, field: object }[], retypes: { name: string, from: string, to: string }[], drops: object[] }}
 *   `adds`: campos nuevos (id nuevo), `renames`: cambios de nombre, `retypes`: cambios de tipo, `drops`: campos eliminados (deprecación lógica).
 * @example
 * const oldR = { fields: [{ id: 'f1', name: 'title', type: 'string' }] };
 * const newR = { fields: [{ id: 'f1', name: 'titulo', type: 'string' }, { id: 'f2', name: 'desc', type: 'text' }] };
 * diffResources(oldR, newR)
 * // → { adds: [{ id: 'f2', name: 'desc', type: 'text' }], renames: [{ from: 'title', to: 'titulo', field: {...} }], retypes: [], drops: [] }
 */
export function diffResources(oldResource, newResource) {
  const oldById = new Map(oldResource.fields.map((f) => [f.id, f]));
  const newById = new Map(newResource.fields.map((f) => [f.id, f]));

  const adds = [];
  const renames = [];
  const retypes = [];
  const drops = [];

  for (const nf of newResource.fields) {
    const of = oldById.get(nf.id);
    if (!of) {
      adds.push(nf); // id nuevo → columna nueva
      continue;
    }
    if (of.name !== nf.name) renames.push({ from: of.name, to: nf.name, field: nf });
    if (of.type !== nf.type) retypes.push({ name: nf.name, from: of.type, to: nf.type });
  }
  for (const of of oldResource.fields) {
    if (!newById.has(of.id)) drops.push(of); // id ausente en el nuevo → drop (deprecación lógica)
  }

  return { adds, renames, retypes, drops };
}
