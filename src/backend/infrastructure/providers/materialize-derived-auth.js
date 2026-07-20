import { materializeContractFromProviders } from './registry.js';

/**
 * P6b (no-code.md §7): materializa la auth de Users DERIVADA en el contrato al publicar.
 * Función pura: con ≥1 provider de auth linkeado (enabled), el snapshot queda auto-contenido con
 * `userAuthEnabled: true`, las estrategias = providers linkeados y los redirects POR CONVENCIÓN
 * (fijos, no editables): local `<base>/login → <base>/`; OAuth `<base>/<provider>/login →
 * <base>/auth/callback`.
 *
 * Sin providers de auth linkeados el contrato se devuelve INTACTO — compatibilidad con contratos
 * v1 autorados por API con `auth` explícita.
 *
 * P8.5: la lógica per-provider (stores.sql/nosql para database, auth.strategies para auth) vive
 * en el registry (`infrastructure/providers/registry.js`). Este archivo queda con la única
 * responsabilidad cross-provider: auto-inject del resource `users` cuando hay auth y no existe.
 *
 * @param {{ contract: object, linkedProviders: Array<{category: string, provider: string, enabled: any}>, subdomain: string, appUrl: string }} args
 * @param {object} args.contract - Contrato a materializar.
 * @param {Array} args.linkedProviders - Providers linkeados del tenant.
 * @param {string} args.subdomain - Subdominio del tenant.
 * @param {string} args.appUrl - URL base de la aplicación.
 * @returns {object} Contrato materializado con auth derivada y resource `users` auto-inyectado si aplica.
 */
export function materializeDerivedAuth({ contract, linkedProviders, subdomain, appUrl }) {
  const materialized = materializeContractFromProviders(contract, { linkedProviders, subdomain, appUrl });

  // Cross-provider: auto-inject del resource `users` si hay auth activa y aún no existe.
  const hasAuth = materialized.auth?.userAuthEnabled === true;
  if (!hasAuth) return materialized;

  const resources = [...(materialized.resources || [])];
  if (resources.some((r) => r.name === 'users')) return materialized;

  const dbStore = materialized.stores?.sql?.enabled
    ? 'sql'
    : (materialized.stores?.nosql?.enabled ? 'nosql' : null);
  if (!dbStore) return materialized;

  resources.unshift({
    name: 'users',
    store: dbStore,
    physicalName: 'users_db',
    manageable: false,
    fields: [
      { id: 'f_user_email', name: 'email', type: 'string', required: true, unique: true },
      { id: 'f_user_name', name: 'name', type: 'string', required: true },
      { id: 'f_user_password_hash', name: 'password_hash', type: 'string', required: false },
    ],
  });

  return { ...materialized, resources };
}
