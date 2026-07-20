/**
 * Pruebas unitarias del helper subdomainOf del hook tenant-loader.
 * Verifica extracción de subdominio desde host, descarte de puerto
 * y normalización a minúsculas.
 *
 * @module KernelTenantLoaderHookUnitTest
 */
import { describe, it, expect } from 'vitest';
import { subdomainOf } from '../hooks/tenant-loader.hook.js';

// BASE_DOMAIN = 'localhost' en test (APP_URL=http://localhost:3000).
describe('subdomainOf', () => {
  it.each([
    ['tienda.localhost', 'tienda'],
    ['tienda.localhost:3000', 'tienda'], // descarta el puerto
    ['TIENDA.localhost', 'tienda'], // normaliza a minúsculas
  ])('extrae el subdominio de %s', (host, expected) => {
    expect(subdomainOf(host)).toBe(expected);
  });

  it.each([
    ['localhost', 'apex exacto'],
    ['localhost:3000', 'apex con puerto'],
    ['www.localhost', 'www = apex'],
    ['a.b.localhost', 'multi-nivel no válido'],
    ['example.com', 'host desconocido'],
    ['', 'vacío'],
    [undefined, 'undefined'],
  ])('devuelve null para %s (%s)', (host) => {
    expect(subdomainOf(host)).toBeNull();
  });
});
