import { describe, it, expect } from 'vitest';
import { buildCreateTable, buildAlterStatements } from '../pg-ddl.builder.js';

const resource = {
  physicalName: 'products_db',
  fields: [
    { id: 'f1', name: 'title', type: 'string', required: true },
    { id: 'f2', name: 'price', type: 'integer' },
    { id: 'f3', name: 'meta', type: 'json' },
  ],
};

describe('buildCreateTable (pg)', () => {
  it('mapea tipos, escapa identificadores e inyecta los campos de auditoría', () => {
    const sql = buildCreateTable(resource);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "products_db"');
    expect(sql).toContain('"id" text PRIMARY KEY');
    expect(sql).toContain('"title" varchar(255) NOT NULL');
    expect(sql).toContain('"price" bigint');
    expect(sql).toContain('"meta" jsonb');
    expect(sql).toContain('"created_at" bigint NOT NULL');
    expect(sql).toContain('"updated_at" bigint NOT NULL');
    expect(sql).toContain('"deleted_at" bigint');
  });

  it('soporta tipo string con longitud variable (varchar(N))', () => {
    const resourceWithLength = {
      physicalName: 'custom_db',
      fields: [
        { id: 'f1', name: 'short_code', type: 'string', length: 10 },
      ],
    };
    const sql = buildCreateTable(resourceWithLength);
    expect(sql).toContain('"short_code" varchar(10)');
  });

  it('rechaza identificadores inválidos (anti-inyección)', () => {
    expect(() => buildCreateTable({ physicalName: 'p"; DROP TABLE x; --', fields: [{ id: 'f', name: 'a', type: 'string' }] })).toThrow(/inválido/);
    expect(() => buildCreateTable({ physicalName: 'p_db', fields: [{ id: 'f', name: 'A; --', type: 'string' }] })).toThrow(/inválido/);
  });

  it('rechaza tipos de campo no soportados', () => {
    expect(() => buildCreateTable({ physicalName: 'p_db', fields: [{ id: 'f', name: 'a', type: 'uuid' }] })).toThrow(/Tipo/);
  });

  it('soporta CHECK constraints, FOREIGN KEYs y columnas generadas', () => {
    const resourceWithRel = {
      physicalName: 'orders_db',
      fields: [
        { id: 'f1', name: 'user_id', type: 'relation', target: 'users', required: true },
        { id: 'f2', name: 'price', type: 'float', check: 'price >= 0' },
        { id: 'f3', name: 'qty', type: 'integer' },
        { id: 'f4', name: 'subtotal', type: 'float', generatedAs: 'qty * price' }
      ]
    };
    const allResources = [
      { name: 'users', physicalName: 'users_db' },
      resourceWithRel
    ];
    const sql = buildCreateTable(resourceWithRel, allResources);
    expect(sql).toContain('"user_id" text NOT NULL REFERENCES "users_db"(id) ON DELETE CASCADE');
    expect(sql).toContain('"price" double precision CHECK (price >= 0)');
    expect(sql).toContain('"subtotal" double precision GENERATED ALWAYS AS (qty * price) STORED');
  });
});

describe('buildAlterStatements (migración)', () => {
  it('genera ADD/RENAME/RETYPE (drops omitidos = deprecación lógica)', () => {
    const diff = {
      adds: [{ name: 'active', type: 'boolean' }],
      renames: [{ from: 'title', to: 'name' }],
      retypes: [{ name: 'price', from: 'integer', to: 'float' }],
      drops: [{ name: 'old_col' }],
    };
    expect(buildAlterStatements('products_db', diff)).toEqual([
      'ALTER TABLE "products_db" ADD COLUMN IF NOT EXISTS "active" boolean',
      'ALTER TABLE "products_db" RENAME COLUMN "title" TO "name"',
      'ALTER TABLE "products_db" ALTER COLUMN "price" TYPE double precision USING "price"::double precision',
    ]);
  });

  it('soporta CHECK, REFERENCES y GENERATED en columnas añadidas', () => {
    const diff = {
      adds: [
        { name: 'product_id', type: 'relation', target: 'products', required: true },
        { name: 'discount', type: 'float', check: 'discount >= 0' },
        { name: 'total', type: 'float', generatedAs: 'price - discount' }
      ],
      renames: [],
      retypes: [],
      drops: []
    };
    const allResources = [{ name: 'products', physicalName: 'products_db' }];
    expect(buildAlterStatements('orders_db', diff, allResources)).toEqual([
      'ALTER TABLE "orders_db" ADD COLUMN IF NOT EXISTS "product_id" text REFERENCES "products_db"(id) ON DELETE CASCADE',
      'ALTER TABLE "orders_db" ADD COLUMN IF NOT EXISTS "discount" double precision CHECK (discount >= 0)',
      'ALTER TABLE "orders_db" ADD COLUMN IF NOT EXISTS "total" double precision GENERATED ALWAYS AS (price - discount) STORED'
    ]);
  });

  it('soporta ALTER TABLE con varchar(length) en adds y retypes', () => {
    const diff = {
      adds: [{ name: 'code', type: 'string', length: 16 }],
      renames: [],
      retypes: [{ name: 'description', from: 'text', to: 'string' }],
      drops: [],
    };
    expect(buildAlterStatements('products_db', diff)).toEqual([
      'ALTER TABLE "products_db" ADD COLUMN IF NOT EXISTS "code" varchar(16)',
      'ALTER TABLE "products_db" ALTER COLUMN "description" TYPE varchar(255) USING "description"::varchar(255)',
    ]);
  });

  it('diff vacío → sin sentencias', () => {
    expect(buildAlterStatements('p_db', { adds: [], renames: [], retypes: [], drops: [] })).toEqual([]);
  });
});
