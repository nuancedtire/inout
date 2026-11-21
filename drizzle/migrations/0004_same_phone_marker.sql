-- Same-phone detection. A random per-browser marker is created on the phone; only its SHA-256
-- hash is stored, on the passkey it enrolled and on each staff check-in/check-out end. Lets the
-- coordinator see when one phone is used for more than one person. Additive only: new nullable
-- columns and indexes, no table is recreated.
ALTER TABLE `staff_credentials` ADD COLUMN `device_hash` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `device_hash_in` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `device_hash_out` text;--> statement-breakpoint
CREATE INDEX `idx_credentials_device` ON `staff_credentials` (`device_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_device_in` ON `sessions` (`device_hash_in`);--> statement-breakpoint
CREATE INDEX `idx_sessions_device_out` ON `sessions` (`device_hash_out`);
