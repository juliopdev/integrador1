import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createContractRepository } from '../../infrastructure/no-code/contract.repository.js';
import { createProviderRepository } from '../../feature/manage-platform-provider/infrastructure/provider-tenant.repository.js';
import { createRoleRepository } from '../../feature/manage-platform-role/infrastructure/role.repository.js';
import { createApiKeyRepository } from '../../feature/manage-platform-apikey/infrastructure/api-key.repository.js';
import { createUserRepository } from '../../feature/auth-user/infrastructure/user.repository.js';
import { createCloudinaryStore } from '../../infrastructure/providers/cloudinary.adapter.js';
import { decrypt } from '../../common/crypto.js';
import { AppError } from '../../common/errors.js';

/**
 * Proveedores por-TENANT del composition root (kernel/bootstrap/): fábricas de repositorios y
 * helpers que abren el `<tenantId>.db` (pool LRU) o consumen el `request.db` ya resuelto por el
 * `tenant-loader`. Concentran el patrón repetido `create*Repository({ db: drizzle(pool.get(id)) })`
 * para que los orquestadores (`bootstrap-platform.js` / `bootstrap-tenant.js`) queden como wiring puro.
 *
 * Ver .doc/rules/architecture.md §2 (composition root) y .doc/tree/src/backend/kernel.md.
 */

/** Descifra la config de un row de `tenant_providers` (wrapper JSON → decrypt → config JSON). */
export function decryptProviderConfig(row) {
  return JSON.parse(decrypt(JSON.parse(row.configValuesJson)));
}

/**
 * Config descifrada del provider `auth/google` del tenant (o `null` si no está linkeado o la
 * config es ilegible). Recibe el Drizzle db del tenant — sirve tanto para `request.db` como para
 * el pool por id.
 */
export function googleAuthConfigFrom(db) {
  const row = createProviderRepository({ db }).findByCategory({ category: 'auth', provider: 'google' });
  if (!row) return null;
  try {
    return decryptProviderConfig(row);
  } catch {
    return null;
  }
}

/**
 * Resolver del store de assets: abre el provider `category=storage` del tenant, descifra la URI
 * y arma el adapter. Solo soportamos `cloudinary` hoy; otros lanzan error explícito.
 */
export async function resolveAssetStore({ tenantDb, provider }) {
  if (provider !== 'cloudinary') {
    throw new AppError(501, 'ASSET_PROVIDER_NOT_SUPPORTED', `El provider de assets "${provider}" no está soportado aún.`);
  }
  const providerRepository = createProviderRepository({ db: tenantDb });
  const row = providerRepository.findByCategory({ category: 'storage', provider: 'cloudinary' });
  if (!row) {
    throw new AppError(503, 'STORE_NOT_CONFIGURED', 'El tenant no tiene un provider storage/cloudinary linkeado.');
  }
  return createCloudinaryStore(decryptProviderConfig(row).uri);
}

/**
 * Fábricas por `tenantId` sobre el pool LRU de la app. Un solo lugar sabe cómo abrir el
 * `<tenantId>.db`; los orquestadores piden repos por id sin repetir el ritual del pool.
 *
 * @param {import('fastify').FastifyInstance} app  con `app.tenantPool` decorado por db-pool
 */
export function createTenantProviders(app) {
  const dbFor = (tenantId) => drizzle(app.tenantPool.get(tenantId));
  return {
    dbFor,
    contractRepositoryFor: (tenantId) => createContractRepository({ db: dbFor(tenantId) }),
    providerRepositoryFor: (tenantId) => createProviderRepository({ db: dbFor(tenantId) }),
    roleRepositoryFor: (tenantId) => createRoleRepository({ db: dbFor(tenantId) }),
    apiKeyRepositoryFor: (tenantId) => createApiKeyRepository({ db: dbFor(tenantId) }),
    userRepositoryFor: (tenantId) => createUserRepository({ db: dbFor(tenantId) }),
    googleAuthConfigFor: (tenantId) => googleAuthConfigFrom(dbFor(tenantId)),
  };
}
