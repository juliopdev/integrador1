PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tenant_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`provider` text NOT NULL,
	`config_values_json` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "tenant_providers_category_chk" CHECK("__new_tenant_providers"."category" in ('storage', 'database', 'auth', 'mail', 'payments'))
);
--> statement-breakpoint
INSERT INTO `__new_tenant_providers`("id", "category", "provider", "config_values_json", "enabled", "created_at", "updated_at") SELECT "id", "category", "provider", "config_values_json", "enabled", "created_at", "updated_at" FROM `tenant_providers`;--> statement-breakpoint
DROP TABLE `tenant_providers`;--> statement-breakpoint
ALTER TABLE `__new_tenant_providers` RENAME TO `tenant_providers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_tenant_providers_category` ON `tenant_providers` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tenant_providers` ON `tenant_providers` (`category`,`provider`);