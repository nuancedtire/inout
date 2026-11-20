-- Verified QR check-in: stable staff records, passkey credentials, WebAuthn challenges,
-- department area settings and per-session evidence. Additive only: existing rows stay
-- valid (new columns are nullable or defaulted) and no table is recreated.
-- Written by hand from `drizzle-kit generate` output because snapshot metadata is not tracked.
CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`role` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_staff_normalized_name` ON `staff` (`normalized_name`);--> statement-breakpoint
ALTER TABLE `roster_entries` ADD COLUMN `staff_id` integer REFERENCES `staff`(`id`);--> statement-breakpoint
CREATE INDEX `idx_roster_staff` ON `roster_entries` (`staff_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_roster_rota_staff` ON `roster_entries` (`rota_id`,`staff_id`) WHERE staff_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `staff_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` integer NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text,
	`backed_up` integer DEFAULT 0 NOT NULL,
	`aaguid` text,
	`label` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text,
	`reviewed_at` text,
	`reviewed_by` text,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_credentials_staff` ON `staff_credentials` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_credentials_status` ON `staff_credentials` (`status`);--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
	`challenge` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`staff_id` integer,
	`roster_entry_id` integer,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_challenges_expires` ON `webauthn_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`latitude` real,
	`longitude` real,
	`radius_m` integer DEFAULT 150 NOT NULL,
	`accuracy_ceiling_m` integer DEFAULT 100 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `identity_in` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `identity_out` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `credential_id_in` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `credential_id_out` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `location_in` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `location_out` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `accuracy_in_m` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `accuracy_out_m` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `review_state` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `review_note` text;
