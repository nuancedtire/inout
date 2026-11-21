-- Shift-end reminders and reported check-outs. Web Push subscriptions bound to stable staff
-- records; per-session reminder marker and check-out source. Additive only: existing rows stay
-- valid (new columns are nullable) and no table is recreated.
-- Written by hand from `drizzle-kit generate` output because snapshot metadata is not tracked.
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_success_at` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_staff` ON `push_subscriptions` (`staff_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `reminder_sent_at` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `checkout_source` text;--> statement-breakpoint
CREATE INDEX `idx_sessions_open_checkin` ON `sessions` (`check_in_at`) WHERE check_out_at IS NULL;
