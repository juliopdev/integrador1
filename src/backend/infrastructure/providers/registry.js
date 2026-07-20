import { parseCloudinaryUri } from './cloudinary.adapter.js';
import { createNeonStore } from './neon-tech.adapter.js';
import { testStripeConnection } from './stripe.adapter.js';

/**
 * P8.5: Registry declarativo de providers. Fuente ÚNICA de verdad para:
 *   - Catálogo del wizard (`_step-manage-provider.ejs` deriva `CATALOG` de acá).
 *   - Enum Zod de `linkProviderSchema` (categorías + providers permitidos).
 *   - `testConnection` del composition root (delega a `desc.testConnection`).
 *   - `findContractDependencies` (delega a `desc.findDependencies`).
 *   - `materialize-derived-auth` (itera providers linkeados llamando `desc.materializeContract`).
 *   - `store-resolver.js` (mapea `resource.store` → provider via `desc.storeType`).
 *
 * Agregar un provider = agregar UNA entrada acá + (si es una CATEGORÍA nueva) extender el
 * CHECK del schema Drizzle. Cero switches nuevos, cero enums que actualizar en otros archivos.
 *
 * Contract de cada entrada:
 * @typedef {Object} ProviderDescriptor
 * @property {'database'|'auth'|'storage'|'mail'|'payments'} category
 * @property {string} provider - Slug único dentro de su categoría.
 * @property {string} label - Nombre humano en el wizard.
 * @property {boolean} operable - Si false, se renderiza como "Próximamente" y `testConnection` fija returns false.
 * @property {'sql'|'nosql'|null} [storeType] - Sólo para category='database'. Mapea `resource.store` en el contrato.
 * @property {Array<{name: string, label: string, placeholder?: string, type: string}>} fields - Campos del form.
 * @property {(args: { config: object }) => Promise<boolean>} testConnection - Ping/validación de credenciales.
 * @property {(schema: object|null) => Array<{ kind: 'resource'|'strategy', name: string, store?: string }>} findDependencies - Qué del contrato depende de este provider.
 * @property {(contract: object, ctx: { subdomain: string, appUrl: string }) => object} materializeContract - Función pura que "aplica" el provider al contrato antes de publicar (auth strategies, stores flags, etc.). Retorna el contrato modificado.
 */

// Helpers reusables por varios descriptors.
const noDependencies = () => [];
const passthroughMaterialize = (contract) => contract;

// Base de detección de dependencias para providers de auth por strategy name.
function authStrategyDeps(providerName) {
  return (schema) => {
    if (!schema) return [];
    const strategies = schema.auth?.strategies || [];
    return strategies.includes(providerName) ? [{ kind: 'strategy', name: providerName }] : [];
  };
}

// Base de detección para providers de database por storeType.
function storeTypeDeps(storeType) {
  return (schema) => {
    if (!schema) return [];
    return (schema.resources || [])
      .filter((r) => r.store === storeType)
      .map((r) => ({ kind: 'resource', name: r.name, store: storeType }));
  };
}

// Materializador para providers de database: setea `stores.<type> = { provider, enabled: true }`.
function dbStoreMaterializer(providerName, storeType) {
  return (contract) => {
    const stores = { ...(contract.stores || {}) };
    stores[storeType] = { provider: providerName, enabled: true };
    return { ...contract, stores };
  };
}

// Materializador para providers de auth: agrega la strategy a `auth.strategies` y computa
// redirects por convención (misma regla que hoy vive en `materialize-derived-auth.js`).
// Ojo: NO se hace el auto-inject del resource `users` acá — esa es lógica CROSS-provider (aplica
// si ≥1 auth linkeado, no por-provider). Vive en el orquestador que llama al registry.
function authMaterializer(providerName) {
  return (contract, { subdomain, appUrl }) => {
    const url = new URL(appUrl);
    const base = `${url.protocol}//${subdomain}.${url.host}`;
    const redirect = providerName === 'local' ? `${base}/` : `${base}/auth/callback`;

    const existing = contract.auth || { userAuthEnabled: false, strategies: [], redirectUris: [] };
    const strategies = [...new Set([...(existing.strategies || []), providerName])];
    const redirectUris = [...new Set([...(existing.redirectUris || []), redirect])];

    return {
      ...contract,
      auth: { userAuthEnabled: true, strategies, redirectUris },
    };
  };
}

/**
 * Descriptors de todos los providers conocidos por el sistema. Ordenados por categoría, luego
 * por operabilidad. Los NO operables tienen `testConnection: async () => false` (guarda universal).
 */
export const PROVIDER_REGISTRY = [
  // ── database ──────────────────────────────────────────────────────
  {
    category: 'database', provider: 'neon',
    label: 'Neon (Postgres SQL)', operable: true, storeType: 'sql',
    fields: [{ name: 'config.uri', label: 'URI de conexión', placeholder: 'postgresql://user:pass@host.neon.tech/db?sslmode=require', type: 'text' }],
    testConnection: async ({ config }) => {
      const store = createNeonStore(config.uri);
      try { await store.query('SELECT 1'); return true; }
      catch { return false; }
      finally { await store.close().catch(() => {}); }
    },
    findDependencies: storeTypeDeps('sql'),
    materializeContract: dbStoreMaterializer('neon', 'sql'),
  },
  {
    category: 'database', provider: 'mongodb-atlas',
    label: 'MongoDB Atlas (NoSQL)', operable: true, storeType: 'nosql',
    fields: [{ name: 'config.uri', label: 'URI de conexión (SRV)', placeholder: 'mongodb+srv://user:pass@cluster.mongodb.net/db', type: 'text' }],
    testConnection: async ({ config }) => {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(String(config?.uri ?? ''), { serverSelectionTimeoutMS: 8000 });
      try { await client.connect(); await client.db().admin().ping(); return true; }
      catch { return false; }
      finally { await client.close().catch(() => {}); }
    },
    findDependencies: storeTypeDeps('nosql'),
    materializeContract: dbStoreMaterializer('mongodb-atlas', 'nosql'),
  },

  // ── auth ───────────────────────────────────────────────────────────
  {
    category: 'auth', provider: 'local',
    label: 'Local (email + contraseña)', operable: true,
    fields: [], // sin environments — toggle directo
    testConnection: async () => true, // el local no tiene handshake externo
    findDependencies: authStrategyDeps('local'),
    materializeContract: authMaterializer('local'),
  },
  {
    category: 'auth', provider: 'google',
    label: 'Google (OAuth 2.0)', operable: true,
    fields: [
      { name: 'config.clientId', label: 'Client ID', placeholder: 'XXXXX.apps.googleusercontent.com', type: 'text' },
      { name: 'config.clientSecret', label: 'Client Secret', placeholder: 'GOCSPX-XXXX', type: 'password' },
    ],
    testConnection: async ({ config }) => {
      const clientId = String(config?.clientId ?? '');
      const clientSecret = String(config?.clientSecret ?? '');
      return clientId.endsWith('.apps.googleusercontent.com') && clientSecret.length > 0;
    },
    findDependencies: authStrategyDeps('google'),
    materializeContract: authMaterializer('google'),
  },
  { category: 'auth', provider: 'facebook',  label: 'Facebook',  operable: false, fields: [], testConnection: async () => false, findDependencies: noDependencies, materializeContract: passthroughMaterialize },
  { category: 'auth', provider: 'linkedin',  label: 'LinkedIn',  operable: false, fields: [], testConnection: async () => false, findDependencies: noDependencies, materializeContract: passthroughMaterialize },
  { category: 'auth', provider: 'github',    label: 'GitHub',    operable: false, fields: [], testConnection: async () => false, findDependencies: noDependencies, materializeContract: passthroughMaterialize },
  { category: 'auth', provider: 'apple',     label: 'Apple',     operable: false, fields: [], testConnection: async () => false, findDependencies: noDependencies, materializeContract: passthroughMaterialize },
  { category: 'auth', provider: 'microsoft', label: 'Microsoft', operable: false, fields: [], testConnection: async () => false, findDependencies: noDependencies, materializeContract: passthroughMaterialize },

  // ── storage ───────────────────────────────────────────────────────
  // ── mail (P8.4) ───────────────────────────────────────────────────
  // Correos empresariales del TENANT — dirigidos a los end users (activation, reset-pass,
  // welcome OAuth, notifications). Los correos a admins (superadmin, master, staff) SIGUEN
  // saliendo por `infrastructure/providers/mail.adapter.js` con `env.API_KEY_RESEND`. Sin
  // provider de esta categoría linkeado, `sendUserMail` es no-op silencioso (matches el patrón
  // anti-enumeración de auth-user forgot-pass y evita filtrar branding de juliopariona.com).
  {
    category: 'mail', provider: 'resend',
    label: 'Resend', operable: true,
    fields: [
      { name: 'config.apiKey', label: 'API key', placeholder: 're_xxxxxxxxxxxx', type: 'password' },
      { name: 'config.from', label: 'Remitente verificado', placeholder: 'noreply@tudominio.com', type: 'text' },
    ],
    // P8.4b: settings del provider — políticas del Master (no credenciales). El wizard renderiza
    // estos como checkboxes. Cada key aparece en `tenant-mail.adapter.js#sendUserMail(mailType)`.
    settings: {
      fields: [
        { name: 'toggles.userAuth', label: 'Enviar correos de autenticación a mis usuarios', type: 'checkbox', default: true, description: 'Activación de cuenta, restablecer contraseña, welcome OAuth' },
        { name: 'toggles.userSupport', label: 'Enviar correos de soporte a mis usuarios', type: 'checkbox', default: true, description: 'Buzón de quejas, help desk, respuestas del soporte' },
      ],
    },
    testConnection: async ({ config }) => {
      const apiKey = String(config?.apiKey ?? '');
      const from = String(config?.from ?? '');
      // Shape mínimo: key resend + email from con `@`. El handshake real (verificar el dominio)
      // se hace en Resend fuera de la plataforma — acá sólo prevenimos configs claramente rotos.
      if (!/^re_[A-Za-z0-9_-]{20,}$/.test(apiKey)) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return false;
      return true;
    },
    // P8.4c: envío via SDK Resend (única dep instalada). `sendUserMail` en `tenant-mail.adapter.js`
    // delega a este método sin conocer implementación.
    send: async ({ config, to, subject, html }) => {
      const { Resend } = await import('resend');
      const client = new Resend(config.apiKey);
      const res = await client.emails.send({ from: config.from, to, subject, html });
      if (res.error) return { ok: false, error: res.error.message || 'unknown' };
      return { ok: true, id: res.data?.id ?? 'resend-sent' };
    },
    findDependencies: noDependencies, // mail no aparece en el schema del contrato — es tenant setting
    materializeContract: passthroughMaterialize,
  },
  {
    category: 'mail', provider: 'smtp',
    label: 'SMTP genérico', operable: true,
    fields: [
      { name: 'config.host', label: 'Host', placeholder: 'smtp.tudominio.com', type: 'text' },
      { name: 'config.port', label: 'Puerto', placeholder: '587', type: 'text' },
      { name: 'config.user', label: 'Usuario', placeholder: 'user@tudominio.com', type: 'text' },
      { name: 'config.pass', label: 'Contraseña', placeholder: '', type: 'password' },
      { name: 'config.from', label: 'Remitente', placeholder: 'noreply@tudominio.com', type: 'text' },
    ],
    settings: {
      fields: [
        { name: 'toggles.userAuth', label: 'Enviar correos de autenticación a mis usuarios', type: 'checkbox', default: true, description: 'Activación de cuenta, restablecer contraseña, welcome OAuth' },
        { name: 'toggles.userSupport', label: 'Enviar correos de soporte a mis usuarios', type: 'checkbox', default: true, description: 'Buzón de quejas, help desk, respuestas del soporte' },
      ],
    },
    testConnection: async ({ config }) => {
      const host = String(config?.host ?? '');
      const port = Number(config?.port ?? 0);
      const user = String(config?.user ?? '');
      const pass = String(config?.pass ?? '');
      const from = String(config?.from ?? '');
      if (!host || !port || !user || !pass || !from) return false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return false;

      try {
        const { default: nodemailer } = await import('nodemailer');
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        await transporter.verify();
        return true;
      } catch (err) {
        return false;
      }
    },
    send: async ({ config, to, subject, html }) => {
      try {
        const { default: nodemailer } = await import('nodemailer');
        const transporter = nodemailer.createTransport({
          host: config.host,
          port: Number(config.port),
          secure: Number(config.port) === 465,
          auth: {
            user: config.user,
            pass: config.pass,
          },
        });
        const info = await transporter.sendMail({
          from: config.from,
          to,
          subject,
          html,
        });
        return { ok: true, id: info.messageId || 'smtp-sent' };
      } catch (err) {
        return { ok: false, error: err.message || 'SMTP send failed' };
      }
    },
    findDependencies: noDependencies,
    materializeContract: passthroughMaterialize,
  },

  // ── storage ───────────────────────────────────────────────────────
  {
    category: 'storage', provider: 'cloudinary',
    label: 'Cloudinary', operable: true,
    fields: [{ name: 'config.uri', label: 'URI de Cloudinary', placeholder: 'cloudinary://KEY:SECRET@CLOUD_NAME', type: 'password' }],
    testConnection: async ({ config }) => {
      let creds;
      try { creds = parseCloudinaryUri(config?.uri); }
      catch { return false; }
      const { v2: cloudinary } = await import('cloudinary');
      cloudinary.config({ cloud_name: creds.cloudName, api_key: creds.apiKey, api_secret: creds.apiSecret, secure: true });
      try { const ping = await cloudinary.api.ping(); return ping.status === 'ok'; }
      catch { return false; }
    },
    findDependencies: noDependencies, // los assets se referencian por `field.type='asset'` runtime, no en el schema
    materializeContract: passthroughMaterialize,
  },
  { category: 'storage', provider: 'box', label: 'Box', operable: false, fields: [], testConnection: async () => false, findDependencies: noDependencies, materializeContract: passthroughMaterialize },

  // ── payments (P8.3) ─────────────────────────────────────────────────
  {
    category: 'payments', provider: 'stripe',
    label: 'Stripe', operable: true,
    fields: [
      { name: 'config.secretKey', label: 'Secret Key', placeholder: 'sk_live_XXXXXXXXXXXXXXXXXXXX', type: 'password' },
      { name: 'config.publishableKey', label: 'Publishable Key', placeholder: 'pk_live_XXXXXXXXXXXXXXXXXXXX', type: 'text' },
      { name: 'config.webhookSecret', label: 'Webhook Signing Secret', placeholder: 'whsec_XXXXXXXXXXXXXXXXXXXX', type: 'password' },
    ],
    testConnection: async ({ config }) => testStripeConnection({ secretKey: config?.secretKey }),
    findDependencies: noDependencies,
    materializeContract: passthroughMaterialize,
  },
  {
    category: 'payments', provider: 'mercadopago',
    label: 'Mercado Pago', operable: false,
    fields: [
      { name: 'config.accessToken', label: 'Access Token', placeholder: 'APP_USR-XXXXXXXX', type: 'password' },
      { name: 'config.publicKey', label: 'Public Key', placeholder: 'APP_USR-XXXXXXXX', type: 'text' },
    ],
    testConnection: async () => false,
    findDependencies: noDependencies,
    materializeContract: passthroughMaterialize,
  },
];

/**
 * Todas las categorías presentes en el registry. Fuente para el enum Zod + el CHECK del schema.
 * NOTA: agregar una categoría al registry requiere migración manual para extender el CHECK de
 * `tenant_providers.category`. Las categorías son conceptualmente estables (no crecen semanalmente).
 */
export const PROVIDER_CATEGORIES = [...new Set(PROVIDER_REGISTRY.map((p) => p.category))];

/**
 * Busca un descriptor por (category, provider).
 *
 * @param {{ category: string, provider: string }} params - Categoría y provider a buscar.
 * @param {string} params.category - Categoría del provider (database, auth, storage, mail, payments).
 * @param {string} params.provider - Slug del provider (neon, google, stripe, etc.).
 * @returns {object|undefined} Descriptor del provider, o `undefined` si no existe.
 */
export function findProvider({ category, provider }) {
  return PROVIDER_REGISTRY.find((p) => p.category === category && p.provider === provider);
}

/**
 * P8.4b: computa el objeto de settings default para un provider recién linkeado, a partir de los
 * `default` declarados en `desc.settings.fields`. Soporta paths tipo `toggles.userAuth` que se
 * expanden a `{ toggles: { userAuth: true } }`. Provider sin `settings` → `{}`.
 *
 * @param {{ category: string, provider: string }} params - Categoría y provider.
 * @param {string} params.category - Categoría del provider.
 * @param {string} params.provider - Slug del provider.
 * @returns {object} Objeto de settings con valores por defecto expandidos.
 */
export function defaultSettingsFor({ category, provider }) {
  const desc = findProvider({ category, provider });
  if (!desc?.settings?.fields?.length) return {};
  const out = {};
  for (const f of desc.settings.fields) {
    if (f.default === undefined) continue;
    // Expandir path con dots: `toggles.userAuth` → out.toggles.userAuth = default
    const parts = String(f.name).split('.');
    let cursor = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = f.default;
  }
  return out;
}

/**
 * Test de conexión GENÉRICO. Reemplaza el if-chain de `platform-providers.js#testConnection`.
 * Descriptores no operables devuelven false automáticamente.
 *
 * @param {{ category: string, provider: string, config: object }} params - Parámetros del test.
 * @param {string} params.category - Categoría del provider.
 * @param {string} params.provider - Slug del provider.
 * @param {object} params.config - Configuración desencriptada del provider.
 * @returns {Promise<boolean>} `true` si la conexión fue exitosa, `false` en caso contrario.
 */
export async function testProviderConnection({ category, provider, config }) {
  const desc = findProvider({ category, provider });
  if (!desc || !desc.operable) return false;
  return desc.testConnection({ config });
}

/**
 * Detecta dependencias de un contrato para un provider. Envuelto por el adapter
 * `infrastructure/providers/find-contract-dependencies.js` (mantiene el nombre estable inyectado).
 *
 * @param {object|null} schema - Schema del contrato (published o draft), o null.
 * @param {string} category - Categoría del provider.
 * @param {string} provider - Slug del provider.
 * @returns {Array<{ kind: 'resource'|'strategy', name: string, store?: string }>} Lista de dependencias; `[]` si el contrato no usa el provider.
 */
export function findContractDependenciesFromRegistry(schema, category, provider) {
  const desc = findProvider({ category, provider });
  if (!desc) return [];
  return desc.findDependencies(schema);
}

/**
 * Materializa los efectos de los providers linkeados sobre un contrato antes de publicar. Itera
 * el registry en vez de switchear. NO incluye el auto-inject del resource `users` — esa lógica
 * cross-provider queda en el orquestador (ver `materialize-derived-auth.js`).
 *
 * Nota `auth`: si hay al menos 1 provider de auth linkeado, la sección `auth` se RESETEA antes
 * de acumular las strategies derivadas. Esto preserva el comportamiento pre-P8.5 de
 * `materialize-derived-auth` que descartaba cualquier `auth.strategies` explícita del contrato
 * (la auth derivada es la fuente de verdad cuando hay providers).
 *
 * @param {object} contract - Contrato original antes de materializar.
 * @param {{ linkedProviders: Array<{ category: string, provider: string, enabled: boolean }>, subdomain: string, appUrl: string }} ctx - Contexto de materialización.
 * @param {Array} ctx.linkedProviders - Providers linkeados del tenant.
 * @param {string} ctx.subdomain - Subdominio del tenant.
 * @param {string} ctx.appUrl - URL base de la aplicación.
 * @returns {object} Contrato materializado con stores, auth y strategies derivadas.
 */
export function materializeContractFromProviders(contract, { linkedProviders, subdomain, appUrl }) {
  const enabled = (linkedProviders || []).filter((p) => p.enabled);
  const hasAuthProvider = enabled.some((p) => p.category === 'auth');
  let result = hasAuthProvider
    ? { ...contract, auth: { userAuthEnabled: false, strategies: [], redirectUris: [] } }
    : contract;

  for (const linked of enabled) {
    const desc = findProvider(linked);
    if (desc?.materializeContract) {
      result = desc.materializeContract(result, { subdomain, appUrl });
    }
  }
  return result;
}
