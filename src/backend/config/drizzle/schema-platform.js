/**
 * Esquema Drizzle de la base de datos de plataforma (platform.db).
 *
 * Define todas las tablas del schema de plataforma usando Drizzle ORM:
 * usuarios de plataforma (superadmin), tenants, planes, membresías,
 * eventos de estado, logs locales, jobs de background, deploys de frontend
 * y tokens de autenticación. Sigue convenciones: snake_case, UUID v7 como
 * TEXT, timestamps como INTEGER (epoch ms), enums mediante CHECK.
 * Fuente de verdad: .doc/rules/databases/platform.md.
 */
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Esquema de `platform.db` (Superadmin). Fuente: .doc/rules/databases/platform.md.
// Convenciones: id TEXT (UUID v7, generado en app), timestamps INTEGER epoch ms,
// enums vía CHECK, snake_case, sufijo _json. Ver .doc/rules/databases/platform.md.

export const platformUsers = sqliteTable('platform_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  passphraseHash: text('passphrase_hash'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  subdomain: text('subdomain').notNull().unique(),
  // PLAN-ux2 P2: nombre visible del proyecto/web del tenant. NULL en legados → la UI cae al subdomain.
  projectName: text('project_name'),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}, (t) => [
  index('idx_tenants_status').on(t.status),
  check('tenants_status_chk', sql`${t.status} in ('pending', 'active', 'suspended')`),
]);

// PLAN-ux2 P2: catálogo de contratos SaaS — SOLO referencial (sin pagos ni enforcement).
// Ids fijos sembrados en la migración; el código referencia por `name`.
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
  featuresJson: text('features_json').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// PLAN-ux2 P2: `plan_name` (enum fijo) → `plan_id` FK a `plans`; `ends_at` pasa a Nullable
// (NULL = contrato permanente; con valor = próxima suspensión — job de expiración en Fase 7).
export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull().references(() => plans.id),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_memberships_tenant').on(t.tenantId),
]);

// PLAN-ux2 P2: bitácora de habilitación/suspensión del tenant (modal "Histórico" del listado).
export const tenantStatusEvents = sqliteTable('tenant_status_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('idx_tenant_status_events_tenant').on(t.tenantId, t.createdAt),
  check('tenant_status_events_event_chk', sql`${t.event} in ('created', 'enabled', 'disabled')`),
]);

export const platformLogsLocal = sqliteTable('platform_logs_local', {
  id: text('id').primaryKey(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('idx_platform_logs_created').on(t.createdAt),
  index('idx_platform_logs_level').on(t.level),
  check('platform_logs_level_chk', sql`${t.level} in ('info', 'warn', 'error')`),
]);

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  tenantId: text('tenant_id'),
  payloadJson: text('payload_json'),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  availableAt: integer('available_at').notNull(),
  lockedAt: integer('locked_at'),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_jobs_status_available').on(t.status, t.availableAt),
  check('jobs_status_chk', sql`${t.status} in ('pending', 'processing', 'completed', 'failed')`),
]);

export const frontendDeploys = sqliteTable('frontend_deploys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }).unique(),
  mode: text('mode').notNull(),
  externalUrl: text('external_url'),
  envVarsJson: text('env_vars_json'),
  extractedPath: text('extracted_path'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('idx_frontend_deploys_status').on(t.status),
  check('frontend_deploys_mode_chk', sql`${t.mode} in ('hosted', 'external')`),
  check('frontend_deploys_status_chk', sql`${t.status} in ('active', 'disabled')`),
]);

export const authTokens = sqliteTable('auth_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => platformUsers.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('idx_auth_tokens_user').on(t.userId),
  index('idx_auth_tokens_type_expires').on(t.type, t.expiresAt),
  check('auth_tokens_type_chk', sql`${t.type} in ('activation', 'password_reset')`),
]);
