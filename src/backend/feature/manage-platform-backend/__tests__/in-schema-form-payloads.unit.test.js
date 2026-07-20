import { describe, it, expect } from 'vitest';
import { addDraftFieldSchema, updateDraftAuthSchema, addDraftResourceSchema } from '../presentation/validators/in.schema.js';

// Regresión P0.2 (PLAN-ux2): el patrón hidden+checkbox con el mismo `name` duplicaba la key
// (`required: ['false','true']` al marcar) y coerceBoolean rechaza arrays → 400 desde la UI.
// El fix quita el hidden y defaultea false cuando la key falta (checkbox desmarcado).
describe('in.schema — payloads del Form SSR (checkboxes sin hidden gemelo)', () => {
  describe('addDraftFieldSchema.required', () => {
    it('checkbox marcado → "true" → true', () => {
      const out = addDraftFieldSchema.parse({ name: 'price', type: 'float', required: 'true' });
      expect(out.required).toBe(true);
    });

    it('checkbox desmarcado → key ausente → false', () => {
      const out = addDraftFieldSchema.parse({ name: 'price', type: 'float' });
      expect(out.required).toBe(false);
    });

    it('array del patrón hidden+checkbox → colapsa al último ("true" gana)', () => {
      // `coerceBoolean` acepta `[hidden, checkbox]` como el submit idiomático del `Form` component:
      // el hidden emite "false" siempre y el checkbox marcado suma "true" → el último gana.
      // Ver validators.js y validators.unit.test.js § "colapsa arrays hidden+checkbox".
      const res = addDraftFieldSchema.safeParse({ name: 'price', type: 'float', required: ['false', 'true'] });
      expect(res.success).toBe(true);
      expect(res.data.required).toBe(true);
    });
  });

  describe('updateDraftAuthSchema.userAuthEnabled', () => {
    it('checkbox marcado → "true" → true', () => {
      const out = updateDraftAuthSchema.parse({ userAuthEnabled: 'true' });
      expect(out.userAuthEnabled).toBe(true);
    });

    it('checkbox desmarcado → key ausente → false', () => {
      const out = updateDraftAuthSchema.parse({});
      expect(out.userAuthEnabled).toBe(false);
    });
  });
  describe('addDraftFieldSchema avanzados', () => {
    it('procesa target vacío y guarda length y check', () => {
      const out = addDraftFieldSchema.parse({
        name: 'test_col',
        type: 'string',
        target: '',
        length: '255',
        check: 'test_col IS NOT NULL',
      });
      expect(out.target).toBeUndefined();
      expect(out.length).toBe(255);
      expect(out.check).toBe('test_col IS NOT NULL');
    });

    it('procesa target con valor real', () => {
      const out = addDraftFieldSchema.parse({
        name: 'user_id',
        type: 'relation',
        target: 'users',
      });
      expect(out.target).toBe('users');
    });
  });

  describe('addDraftResourceSchema manageable', () => {
    it('sin enviar manageable → default true', () => {
      const out = addDraftResourceSchema.parse({
        name: 'orders',
        store: 'sql',
      });
      expect(out.manageable).toBe(true);
    });

    it('enviando false → false', () => {
      const out = addDraftResourceSchema.parse({
        name: 'orders',
        store: 'sql',
        manageable: 'false',
      });
      expect(out.manageable).toBe(false);
    });

    it('enviando true → true', () => {
      const out = addDraftResourceSchema.parse({
        name: 'orders',
        store: 'sql',
        manageable: 'true',
      });
      expect(out.manageable).toBe(true);
    });

    it('enviando array [false, true] → true', () => {
      const out = addDraftResourceSchema.parse({
        name: 'orders',
        store: 'sql',
        manageable: ['false', 'true'],
      });
      expect(out.manageable).toBe(true);
    });
  });
});
