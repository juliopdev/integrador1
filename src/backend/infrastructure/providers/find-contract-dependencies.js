import { findContractDependenciesFromRegistry } from './registry.js';

/**
 * Detecta si un contrato depende de un provider dado. Función pura, sin efectos. La usa tanto
 * `unlink-tenant-provider.usecase.js` (para bloquear/advertir) como `get-wizard-state.usecase.js`
 * (para la preview de impacto en el paso 2 del asistente).
 *
 * P8.5: la lógica per-provider vive en `infrastructure/providers/registry.js` (cada descriptor
 * declara su `findDependencies`). Este archivo mantiene el shape para no romper importadores.
 *
 * @param {object|null} schema - Schema del contrato (published.schema o draft.schema), o null.
 * @param {'database'|'auth'|'storage'|'mail'|'payments'} category
 * @param {string} provider
 * @returns {Array<
 *   { kind: 'resource', name: string, store: string } |
 *   { kind: 'strategy', name: string }
 * >} Lista de dependencias; `[]` si el contrato no usa el provider.
 */
export function findContractDependencies(schema, category, provider) {
  return findContractDependenciesFromRegistry(schema, category, provider);
}
