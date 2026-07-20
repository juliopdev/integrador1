CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`features_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_name_unique` ON `plans` (`name`);--> statement-breakpoint
CREATE TABLE `tenant_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`event` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tenant_status_events_event_chk" CHECK("tenant_status_events"."event" in ('created', 'enabled', 'disabled'))
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_status_events_tenant` ON `tenant_status_events` (`tenant_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `memberships`;--> statement-breakpoint
ALTER TABLE `__new_memberships` RENAME TO `memberships`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_memberships_tenant` ON `memberships` (`tenant_id`);--> statement-breakpoint
ALTER TABLE `tenants` ADD `project_name` text;--> statement-breakpoint
INSERT OR IGNORE INTO `plans` (`id`, `name`, `label`, `description`, `features_json`, `created_at`, `updated_at`) VALUES
('019f2a45-34c9-7ca7-b722-238eaceb829c', 'basic', 'Básico', 'Presencia mínima: un proyecto con mantenimiento corto.', '{"maintenanceMonths":1,"maxSubdomains":1,"deployMonths":6}', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
('019f2a45-34cc-715e-ac9a-dc9a40cba683', 'standard', 'Estándar', 'Proyecto en crecimiento: mantenimiento y deploy extendidos.', '{"maintenanceMonths":3,"maxSubdomains":2,"deployMonths":12}', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
('019f2a45-34cd-724b-b8b3-61658e0c41b3', 'premium', 'Premium', 'Contrato completo: mantenimiento prolongado y deploy permanente.', '{"maintenanceMonths":12,"maxSubdomains":5,"deployMonths":null}', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
