/**
 * Esquema Drizzle de la base de datos de tenant (plantilla).
 *
 * Define todas las tablas que se clonan en cada base SQLite de tenant al
 * aprovisionarse: roles, usuarios, asignaciones de roles, tokens de auth,
 * contratos backend, proveedores configurados, API keys, notificaciones,
 * assets multimedia y logs locales. Sigue las mismas convenciones que
 * schema-platform (snake_case, UUID v7, timestamps INTEGER, enums vía CHECK).
 * Fuente de verdad: .doc/rules/databases/tenant.md.
 */
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Esquema base de `data/tenants/<tenantId>.db`. Fuente: .doc/rules/databases/tenant.md.
// Se clona en cada tenant al aprovisionarse. Mismas convenciones que platform
// (id UUID v7, timestamps INTEGER ms, enums vía CHECK, snake_case, sufijo _json).

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  category: text('category').notNull(),
  isReserved: integer('is_reserved').notNull().default(0),
  permissionsJson: text('permissions_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  check('roles_category_chk', sql`${t.category} in ('master', 'staff', 'user')`),
]);

export const tenantUsers = sqliteTable('tenant_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  passphraseHash: text('passphrase_hash'),
  authProvider: text('auth_provider').notNull().default('local'),
  providerUserId: text('provider_user_id'),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => [
  index('idx_tenant_users_status').on(t.status),
  uniqueIndex('uq_tenant_users_provider').on(t.authProvider, t.providerUserId).where(sql`${t.providerUserId} is not null`),
  check('tenant_users_status_chk', sql`${t.status} in ('invited', 'active', 'suspended')`),
]);

export const userRoles = sqliteTable('user_roles', {
  userId: text('user_id').notNull().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'restrict' }),
  assignedAt: integer('assigned_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.roleId] }),
  index('idx_user_roles_role').on(t.roleId),
]);

export const authTokens = sqliteTable('auth_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => tenantUsers.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('idx_auth_tokens_user').on(t.userId),
  index('idx_auth_tokens_type_expires').on(t.type, t.expiresAt),
  check('auth_tokens_type_chk', sql`${t.type} in ('invitation', 'activation', 'password_reset')`),
]);

export const backendContracts = sqliteTable('backend_contracts', {
  id: text('id').primaryKey(),
  version: text('version').notNull().unique(),
  schemaJson: text('schema_json'),
  status: text('status').notNull().default('draft'),
  publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  check('backend_contracts_status_chk', sql`${t.status} in ('draft', 'published', 'retired')`),
]);

export const tenantProviders = sqliteTable('tenant_providers', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  provider: text('provider').notNull(),
  configValuesJson: text('config_values_json'),
  // P8.4b: settings per-provider en CLARO (no cifrado — son políticas, no credenciales).
  // Shape: `{ toggles: { userAuth: bool, userSupport: bool, ... } }` — cada provider define en el
  // registry qué keys expone (ver `desc.settings.fields`). Preserva `unlink` (row queda con
  // enabled=0 pero settings intactos para relink).
  settingsJson: text('settings_json'),
  enabled: integer('enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_tenant_providers_category').on(t.category),
  uniqueIndex('uq_tenant_providers').on(t.category, t.provider),
  // P8.5 (registry) + P8.4/P8.3 (mail/payments): la fuente de verdad de categorías vive en
  // `infrastructure/providers/registry.js`. Este CHECK debe mantenerse sincronizado con las
  // categorías que aparezcan allí — extender via migración cuando se agregue una nueva.
  check('tenant_providers_category_chk', sql`${t.category} in ('storage', 'database', 'auth', 'mail', 'payments')`),
]);

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scopesJson: text('scopes_json'),
  status: text('status').notNull().default('active'),
  lastUsedAt: integer('last_used_at'),
  expiresAt: integer('expires_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_api_keys_status').on(t.status),
  check('api_keys_status_chk', sql`${t.status} in ('active', 'revoked')`),
]);

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audience: text('audience').notNull(),
  segmentJson: text('segment_json'),
  status: text('status').notNull().default('draft'),
  scheduledAt: integer('scheduled_at'),
  publishedAt: integer('published_at'),
  createdBy: text('created_by').notNull().references(() => tenantUsers.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_notifications_status_scheduled').on(t.status, t.scheduledAt),
  check('notifications_audience_chk', sql`${t.audience} in ('public', 'authenticated', 'segment')`),
  check('notifications_status_chk', sql`${t.status} in ('draft', 'scheduled', 'published', 'canceled')`),
]);

// P8.2: Catálogo LOCAL de assets subidos por el tenant (a Cloudinary/Box). Los bytes viven en el
// CDN del provider; acá guardamos SOLO metadatos (url, publicId, provider, resource/field/row,
// uploader, timestamp) para poder listar/filtrar/paginar la "Biblioteca de medios" del Master
// sin hacer round-trips al provider en cada pageview, y para hard-block del delete si hay filas
// que referencian el asset. Soft-delete via `deletedAt` para audit trail.
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  publicId: text('public_id').notNull(),
  url: text('url').notNull(),
  bytes: integer('bytes').notNull(),
  format: text('format'),
  mimeType: text('mime_type'),
  filename: text('filename'),
  resourceName: text('resource_name'),
  fieldName: text('field_name'),
  rowId: text('row_id'),
  uploadedBy: text('uploaded_by'),
  uploadedAt: integer('uploaded_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => [
  index('idx_assets_provider').on(t.provider),
  index('idx_assets_uploaded_at').on(t.uploadedAt),
  index('idx_assets_resource_field').on(t.resourceName, t.fieldName),
  check('assets_provider_chk', sql`${t.provider} in ('cloudinary', 'box')`),
]);

export const tenantLogsLocal = sqliteTable('tenant_logs_local', {
  id: text('id').primaryKey(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('idx_tenant_logs_created').on(t.createdAt),
  index('idx_tenant_logs_level').on(t.level),
  check('tenant_logs_level_chk', sql`${t.level} in ('info', 'warn', 'error')`),
]);
