ALTER TABLE `modlists` ADD `base_list_id` text;--> statement-breakpoint
ALTER TABLE `modlists` ADD `follow_mode` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `modlists` ADD `base_revision` integer;--> statement-breakpoint
CREATE INDEX `modlists_base_idx` ON `modlists` (`base_list_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `follow_mode` text DEFAULT 'auto' NOT NULL;