import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// SYSTEM SCHEMA (data/system.db)
// ES: Estructura de tablas para la plataforma global de administración.
// EN: Table structure for the global platform administration.
// ============================================================================

/**
 * ES: Tabla de administradores globales del sistema (Superadmin, Master, Staff).
 * EN: Global system administrators table (Superadmin, Master, Staff).
 */
export const admins = sqliteTable('admins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  passphrase: text('passphrase').notNull(),
  role: text('role').notNull().default('superadmin'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * ES: Tabla de inquilinos (Tenants) de la plataforma SaaS. Almacena la configuración básica y subdominio.
 * EN: SaaS Tenants table. Stores basic configurations and assigned subdomains.
 */
export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(), // ES: Identificador único del inquilino. EN: Tenant unique identifier.
  name: text('name').notNull(),
  subdomain: text('subdomain').notNull().unique(),
  status: text('status').notNull().default('active'), // ES: Estado del inquilino (active, suspended). EN: Tenant status (active, suspended).
  plan: text('plan').notNull().default('free'), // ES: Plan de suscripción asociado. EN: Subscription plan associated.
  apiAuthEnabled: integer('api_auth_enabled').default(1).notNull(), // ES: Habilita el login de usuarios finales. EN: Enables end-user login.
  backendBlueprintId: text('backend_blueprint_id'), // ES: ID del plano backend asignado. EN: Assigned backend blueprint ID.
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * ES: Tabla de planos técnicos (Blueprints) para construir APIs sin código a nivel de inquilino.
 * EN: Technical blueprints table to build no-code APIs at the tenant level.
 */
export const backendBlueprints = sqliteTable('backend_blueprints', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull().default('v1'),
  schema: text('schema', { mode: 'json' }).notNull(), // ES: Estructura JSON de tablas y columnas. EN: JSON structure of tables and columns.
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // ES: Borrado lógico para auditoría estructural. EN: Logical deletion for structural audit.
});

/**
 * ES: Tabla de plantillas frontend disponibles para despliegue de sitios en caliente.
 * EN: Frontend templates table available for hot-deploying customer sites.
 */
export const frontendTemplates = sqliteTable('frontend_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  path: text('path').notNull(), // ES: Ruta física o URL del bundle empaquetado (.zip). EN: Physical path or URL of the packaged bundle (.zip).
  config: text('config', { mode: 'json' }).notNull(), // ES: Metadatos de despliegue del frontend. EN: Frontend deployment metadata.
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * ES: Objeto exportado con las definiciones del esquema global del sistema.
 * EN: Exported object containing the global system schema definitions.
 */
export const systemSchema = {
  admins,
  tenants,
  backendBlueprints,
  frontendTemplates,
};

// ============================================================================
// TENANT SCHEMA (data/tenants/<tenantId>.db)
// ES: Estructura de tablas aisladas replicadas por cada inquilino (Tenant).
// EN: Isolated table structures replicated for each tenant space.
// ============================================================================

/**
 * ES: Tabla de usuarios finales pertenecientes a un inquilino.
 * EN: End-users table belonging to a specific tenant.
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  passphrase: text('passphrase'), // ES: Nullable ya que los usuarios comunes no usan frase. EN: Nullable since common users do not use passphrase.
  role: text('role').notNull().default('user'), // ES: Rol del usuario (master, staff, user). EN: User role (master, staff, user).
  status: text('status').notNull().default('active'), // ES: Estado de acceso del usuario. EN: User access status.
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * ES: Tabla de logs de auditoría interna de acciones del inquilino.
 * EN: Tenant internal audit logs table.
 */
export const logs = sqliteTable('logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level').notNull(), // ES: Nivel de severidad (info, warn, error). EN: Severity level (info, warn, error).
  message: text('message').notNull(),
  metadata: text('metadata', { mode: 'json' }), // ES: Detalles extra en formato JSON. EN: Extra details in JSON format.
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * ES: Tabla de mensajería (soporte o chat interactivo) dentro de la cuenta del inquilino.
 * EN: Messaging table (support or interactive chat) within the tenant account.
 */
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  senderId: integer('sender_id').notNull(),
  receiverId: integer('receiver_id'), // ES: Nulo si es un mensaje de sala común. EN: Null if it is a common room message.
  roomId: text('room_id').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * ES: Tabla de notificaciones programadas o emitidas por el inquilino.
 * EN: Notifications table scheduled or published by the tenant.
 */
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  type: text('type').notNull().default('info'), // ES: Tipo de notificación (info, alert, system). EN: Notification type (info, alert, system).
  status: text('status').notNull().default('pending'), // ES: Estado del despacho (pending, scheduled, published). EN: Dispatch status (pending, scheduled, published).
  scheduledAt: text('scheduled_at'), // ES: Fecha de lanzamiento programado. EN: Date of scheduled release.
  publishedAt: text('published_at'), // ES: Fecha de envío final. EN: Date of final transmission.
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * ES: Tabla de definición de roles personalizados para el personal del inquilino.
 * EN: Custom roles definition table for tenant personnel.
 */
export const roles = sqliteTable('roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  permissions: text('permissions', { mode: 'json' }).notNull(), // ES: Lista JSON de permisos autorizados. EN: JSON list of authorized permissions.
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * ES: Objeto exportado con las definiciones del esquema del inquilino.
 * EN: Exported object containing the tenant schema definitions.
 */
export const tenantSchema = {
  users,
  logs,
  messages,
  notifications,
  roles,
};
