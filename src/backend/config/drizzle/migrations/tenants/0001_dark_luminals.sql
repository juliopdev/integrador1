CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`public_id` text NOT NULL,
	`url` text NOT NULL,
	`bytes` integer NOT NULL,
	`format` text,
	`mime_type` text,
	`filename` text,
	`resource_name` text,
	`field_name` text,
	`row_id` text,
	`uploaded_by` text,
	`uploaded_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "assets_provider_chk" CHECK("assets"."provider" in ('cloudinary', 'box'))
);
--> statement-breakpoint
CREATE INDEX `idx_assets_provider` ON `assets` (`provider`);--> statement-breakpoint
CREATE INDEX `idx_assets_uploaded_at` ON `assets` (`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_assets_resource_field` ON `assets` (`resource_name`,`field_name`);