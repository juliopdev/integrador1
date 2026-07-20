CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `platform_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_tokens_type_chk" CHECK("auth_tokens"."type" in ('activation', 'password_reset'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_unique` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_user` ON `auth_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_type_expires` ON `auth_tokens` (`type`,`expires_at`);--> statement-breakpoint
CREATE TABLE `frontend_deploys` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`mode` text NOT NULL,
	`external_url` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "frontend_deploys_mode_chk" CHECK("frontend_deploys"."mode" in ('hosted', 'external')),
	CONSTRAINT "frontend_deploys_status_chk" CHECK("frontend_deploys"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frontend_deploys_tenant_id_unique` ON `frontend_deploys` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_frontend_deploys_status` ON `frontend_deploys` (`status`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`tenant_id` text,
	`payload_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`available_at` integer NOT NULL,
	`locked_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "jobs_status_chk" CHECK("jobs"."status" in ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_status_available` ON `jobs` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plan_name` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memberships_plan_chk" CHECK("memberships"."plan_name" in ('free', 'premium', 'enterprise'))
);
--> statement-breakpoint
CREATE INDEX `idx_memberships_tenant` ON `memberships` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `platform_logs_local` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "platform_logs_level_chk" CHECK("platform_logs_local"."level" in ('info', 'warn', 'error'))
);
--> statement-breakpoint
CREATE INDEX `idx_platform_logs_created` ON `platform_logs_local` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_platform_logs_level` ON `platform_logs_local` (`level`);--> statement-breakpoint
CREATE TABLE `platform_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`passphrase_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_users_email_unique` ON `platform_users` (`email`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`subdomain` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "tenants_status_chk" CHECK("tenants"."status" in ('pending', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_subdomain_unique` ON `tenants` (`subdomain`);--> statement-breakpoint
CREATE INDEX `idx_tenants_status` ON `tenants` (`status`);