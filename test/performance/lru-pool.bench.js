/**
 * Benchmark del pool LRU multi-tenant para conexiones SQLite.
 * Mide los hot paths críticos: cache hit, round-robin bajo capacidad,
 * eviction forzada (working set > capacidad) y patrón realista 90/10
 * (5 hot + cola fría).
 *
 * @module LRUPoolBenchmark
 * @see {@link ../../.doc/rules/tests.md §2 — Rendimiento}
 */
import { bench, describe, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env } from '../../src/backend/config/env.js';
import { migratePlatform, migrateTenant } from '../../src/backend/config/drizzle/migrator.js';
import { platformDb } from '../../src/backend/config/database/platform/sqlite-platform.js';
import { tenants } from '../../src/backend/config/drizzle/schema-platform.js';

// Benchmark del pool LRU multi-tenant (tests.md §2 — Rendimiento).
//
// Por qué esto es la métrica más importante del backend:
//   El pool intercepta CADA request que necesita DB de tenant (tenant-loader.hook). Si el hot path
//   `get()` con cache-hit se degrada 10x, degradamos 10x TODO el tráfico dinámico.
//
// Escenarios medidos:
//   1. Cache hit (ideal)             — mismo tenant repetido; sólo mueve entry al final del Map.
//   2. Round-robin bajo capacidad    — 10 tenants distintos, todos cabiendo en pool max=50.
//   3. Round-robin en capacidad      — 60 tenants distintos con max=50 → forzar eviction constante.
//   4. Working set caliente + cola   — patrón real: 90% requests van a 5 tenants "hot", 10% a la cola.
//
// Correr localmente:
//   pnpm vitest bench test/performance/
//
// Se excluye de `pnpm test` porque bench() no reporta pass/fail — reporta hz/ms. La CI puede
// correrlo aparte y comparar vs baseline en cada PR.

let tmp;
let originalDir;
let LRUConnectionPool;
let hotPool;    // max=50 con 10 tenants sembrados (todos caben)
let tightPool;  // max=50 con 60 tenants sembrados (fuerza eviction en round-robin)

const TENANT_COUNT_HOT = 10;
const TENANT_COUNT_TIGHT = 60;

beforeAll(async () => {
  migratePlatform();
  originalDir = env.TENANTS_DB_DIR;
  tmp = mkdtempSync(join(tmpdir(), 'baas-bench-lru-'));
  env.TENANTS_DB_DIR = tmp;

  // Sembrar TENANT_COUNT_TIGHT tenants (incluye los del hot). Cada uno recibe una migración
  // completa una sola vez aquí — el bench no debe medir el costo de migración.
  const now = Date.now();
  for (let i = 0; i < TENANT_COUNT_TIGHT; i++) {
    const id = `bench-t${i}`;
    platformDb.insert(tenants).values({
      id, subdomain: id, status: 'active', createdAt: now, updatedAt: now,
    }).run();
    migrateTenant(id);
  }

  // Import dinámico DESPUÉS del setup para tomar la clase sin usar el singleton.
  const mod = await import('../../src/backend/config/database/connection-pool/lru-manager.js');
  // El módulo sólo exporta el singleton — reimportamos el archivo para leer la clase.
  // Usamos el patrón: instanciar múltiples pools con `new mod.tenantPool.constructor(...)`.
  LRUConnectionPool = mod.tenantPool.constructor;

  // Precalienta el hot pool con sus 10 tenants.
  hotPool = new LRUConnectionPool({ max: 50, ttlMs: 60_000 * 60 });
  for (let i = 0; i < TENANT_COUNT_HOT; i++) hotPool.get(`bench-t${i}`);

  // El tight pool arranca vacío; el bench mismo llena y desaloja.
  tightPool = new LRUConnectionPool({ max: 50, ttlMs: 60_000 * 60 });
});

afterAll(() => {
  hotPool?.closeAll();
  tightPool?.closeAll();
  env.TENANTS_DB_DIR = originalDir;
  rmSync(tmp, { recursive: true, force: true });
});

describe('pool LRU — hot paths', () => {
  // Baseline: cache hit. Este es el 95%+ de las requests en producción con working-set estable.
  bench('cache hit — mismo tenant repetido', () => {
    hotPool.get('bench-t0');
  });

  // Round-robin con 10 tenants — todos caben, no hay eviction. Mide sólo el costo del Map churn.
  bench('cache hit — round-robin 10 tenants (todos residentes)', () => {
    for (let i = 0; i < TENANT_COUNT_HOT; i++) hotPool.get(`bench-t${i}`);
  });

  // Cache miss + eviction: pool arranca vacío y satura. Rota entre 60 tenants con max=50 → cada
  // vuelta ~20% de requests son miss + eviction (open + PRAGMA + close). Es el peor caso real.
  bench('cache miss + eviction — 60 tenants con max=50 (working set > capacidad)', () => {
    // Un solo pase pisa capacidad; N pases miden costo sostenido.
    for (let i = 0; i < TENANT_COUNT_TIGHT; i++) tightPool.get(`bench-t${i}`);
  });

  // Working set realista: 90% del tráfico a 5 tenants "hot", 10% a la cola (5 nuevos por vuelta).
  // Este es el patrón que espera el pool en producción — el bench captura si la política LRU
  // preserva bien los hot.
  bench('working set caliente 90/10 — 5 hot + 5 cold intercalados', () => {
    // 45 hits al hot set (9 vueltas × 5 tenants), 5 cold intercalados.
    for (let round = 0; round < 9; round++) {
      for (let i = 0; i < 5; i++) hotPool.get(`bench-t${i}`);
    }
    for (let i = TENANT_COUNT_HOT; i < TENANT_COUNT_HOT + 5; i++) hotPool.get(`bench-t${i}`);
  });
});
