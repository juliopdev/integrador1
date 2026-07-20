/**
 * Pruebas unitarias de los validadores comunes (Zod schemas).
 * Cubre: idParam factory, coerceBoolean (incluyendo colapso de arrays
 * hidden+checkbox), y backendVersion (formato v{N}).
 *
 * @module CommonValidatorsUnitTest
 */
import { describe, it, expect } from 'vitest';
import { idParam, backendVersion, coerceBoolean } from '../validators.js';

describe('common/validators — idParam factory', () => {
  it('genera un esquema que valida presencia y longitud mínima', () => {
    const schema = idParam('tenantId');
    expect(schema.safeParse({ tenantId: 't1' }).success).toBe(true);
    expect(schema.safeParse({ tenantId: '' }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('crea esquemas independientes por llamada (no comparte estado)', () => {
    const a = idParam('id');
    const b = idParam('userId');
    expect(a.safeParse({ id: 'x' }).success).toBe(true);
    expect(a.safeParse({ userId: 'x' }).success).toBe(false); // llave equivocada
    expect(b.safeParse({ userId: 'x' }).success).toBe(true);
  });
});

describe('common/validators — coerceBoolean', () => {
  it('acepta booleanos literales sin cambios', () => {
    expect(coerceBoolean.parse(true)).toBe(true);
    expect(coerceBoolean.parse(false)).toBe(false);
  });

  it('coerciona strings "true"/"false" a booleanos', () => {
    expect(coerceBoolean.parse('true')).toBe(true);
    expect(coerceBoolean.parse('false')).toBe(false);
  });

  it('rechaza otros valores (evita coerción implícita ambigua)', () => {
    for (const bad of ['yes', 'no', 1, 0, '1', '0', null, undefined, {}, []]) {
      expect(coerceBoolean.safeParse(bad).success).toBe(false);
    }
  });

  it('colapsa arrays hidden+checkbox — el último gana', () => {
    // `_dynamic-form` renderiza un hidden `false` seguido de un checkbox `true`; cuando el
    // checkbox está marcado, `collectFormData` devuelve `['false', 'true']`.
    expect(coerceBoolean.parse(['false', 'true'])).toBe(true);
    expect(coerceBoolean.parse(['false'])).toBe(false);
    expect(coerceBoolean.parse([true])).toBe(true);
    expect(coerceBoolean.parse([false])).toBe(false);
  });
});

describe('common/validators — backendVersion', () => {
  it('acepta v1, v2, …', () => {
    expect(backendVersion.safeParse('v1').success).toBe(true);
    expect(backendVersion.safeParse('v42').success).toBe(true);
  });

  it('rechaza formatos inválidos', () => {
    for (const bad of ['1', 'V1', 'v', 'v1.0', 'version1', '']) {
      expect(backendVersion.safeParse(bad).success).toBe(false);
    }
  });
});
