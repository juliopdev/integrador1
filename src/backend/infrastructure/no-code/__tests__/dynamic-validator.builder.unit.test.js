import { describe, it, expect } from 'vitest';
import { compileResourceSchema } from '../dynamic-validator.builder.js';

const resource = {
  fields: [
    { id: 'f1', name: 'title', type: 'string', required: true },
    { id: 'f2', name: 'price', type: 'integer', required: true },
    { id: 'f3', name: 'active', type: 'boolean' },
  ],
};

describe('compileResourceSchema', () => {
  it('valida un body correcto', () => {
    const schema = compileResourceSchema(resource);
    expect(schema.safeParse({ title: 'Camisa', price: 100, active: true }).success).toBe(true);
  });

  it('exige los campos required y respeta los tipos', () => {
    const schema = compileResourceSchema(resource);
    expect(schema.safeParse({ price: 100 }).success).toBe(false); // falta title
    expect(schema.safeParse({ title: 'x', price: '100' }).success).toBe(false); // price no es int
  });

  it('rechaza claves desconocidas (strict: no inyectar columnas)', () => {
    const schema = compileResourceSchema(resource);
    expect(schema.safeParse({ title: 'x', price: 1, created_at: 999 }).success).toBe(false);
  });

  it('en modo partial (update) todos los campos son opcionales', () => {
    const schema = compileResourceSchema(resource, { partial: true });
    expect(schema.safeParse({ price: 50 }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('modo coerce: acepta integer/float/boolean como strings (Form SSR)', () => {
    const schema = compileResourceSchema(resource, { coerce: true });
    const parsed = schema.safeParse({ title: 'x', price: '100', active: 'true' });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ title: 'x', price: 100, active: true });
  });

  it('modo coerce: string vacío en numeric no fuerza `0` (queda como string y falla)', () => {
    const schema = compileResourceSchema(resource, { coerce: true });
    expect(schema.safeParse({ title: 'x', price: '' }).success).toBe(false);
  });

  it('modo default (sin coerce) sigue rechazando strings en numeric — retrocompat con el dispatcher', () => {
    const schema = compileResourceSchema(resource);
    expect(schema.safeParse({ title: 'x', price: '100' }).success).toBe(false);
  });
});
