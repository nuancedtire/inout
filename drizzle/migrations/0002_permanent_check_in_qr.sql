-- One permanent check-in QR code for the department, replacing the daily code on posters.
-- Random, stored server-side, readable only by administrators and replaceable by them.
-- Additive only: existing rows stay valid. Daily rota tokens remain accepted but are no longer
-- published by any public endpoint.
ALTER TABLE `site_settings` ADD COLUMN `qr_token` text;
