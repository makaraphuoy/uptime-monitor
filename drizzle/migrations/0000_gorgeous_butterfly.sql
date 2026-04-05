CREATE TABLE IF NOT EXISTS `heartbeats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_time_ms` integer,
	`checked_at` integer,
	`message` text,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`type` text DEFAULT 'http' NOT NULL,
	`interval_seconds` integer DEFAULT 60 NOT NULL,
	`timeout_seconds` integer DEFAULT 30 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
