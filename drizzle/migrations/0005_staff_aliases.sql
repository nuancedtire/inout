-- Remembered rota spellings. When an admin links a rota name to a staff profile by hand, the
-- spelling's matching key is stored here so later rota uploads and check-ins link it
-- automatically. Additive only: one new table and its indexes, no table is recreated.
CREATE TABLE `staff_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_id` integer NOT NULL,
	`name_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_staff_aliases_key_staff` ON `staff_aliases` (`name_key`,`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_aliases_staff` ON `staff_aliases` (`staff_id`);
