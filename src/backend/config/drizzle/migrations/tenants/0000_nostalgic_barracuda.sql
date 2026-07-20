CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes_json` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "api_keys_status_chk" CHECK("api_keys"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_token_hash_unique` ON `api_keys` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_status` ON `api_keys` (`status`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `tenant_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_tokens_type_chk" CHECK("auth_tokens"."type" in ('invitation', 'activation', 'password_reset'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_unique` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_user` ON `auth_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_type_expires` ON `auth_tokens` (`type`,`expires_at`);--> statement-breakpoint
CREATE TABLE `backend_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`schema_json` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "backend_contracts_status_chk" CHECK("backend_contracts"."status" in ('draft', 'published', 'retired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backend_contracts_version_unique` ON `backend_contracts` (`version`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`audience` text NOT NULL,
	`segment_json` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` integer,
	`published_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `tenant_users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "notifications_audience_chk" CHECK("notifications"."audience" in ('public', 'authenticated', 'segment')),
	CONSTRAINT "notifications_status_chk" CHECK("notifications"."status" in ('draft', 'scheduled', 'published', 'canceled'))
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_status_scheduled` ON `notifications` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`is_reserved` integer DEFAULT 0 NOT NULL,
	`permissions_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "roles_category_chk" CHECK("roles"."category" in ('master', 'staff', 'user'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `tenant_logs_local` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "tenant_logs_level_chk" CHECK("tenant_logs_local"."level" in ('info', 'warn', 'error'))
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_logs_created` ON `tenant_logs_local` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tenant_logs_level` ON `tenant_logs_local` (`level`);--> statement-breakpoint
CREATE TABLE `tenant_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`provider` text NOT NULL,
	`config_values_json` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "tenant_providers_category_chk" CHECK("tenant_providers"."category" in ('storage', 'database', 'auth'))
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_providers_category` ON `tenant_providers` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tenant_providers` ON `tenant_providers` (`category`,`provider`);--> statement-breakpoint
CREATE TABLE `tenant_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`passphrase_hash` text,
	`auth_provider` text DEFAULT 'local' NOT NULL,
	`provider_user_id` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "tenant_users_status_chk" CHECK("tenant_users"."status" in ('invited', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_users_email_unique` ON `tenant_users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_tenant_users_status` ON `tenant_users` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tenant_users_provider` ON `tenant_users` (`auth_provider`,`provider_user_id`) WHERE "tenant_users"."provider_user_id" is not null;--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`assigned_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`),
	FOREIGN KEY (`user_id`) REFERENCES `tenant_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_user_roles_role` ON `user_roles` (`role_id`);