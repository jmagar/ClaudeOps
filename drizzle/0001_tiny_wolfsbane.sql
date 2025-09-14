CREATE TABLE `execution_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`step_number` integer NOT NULL,
	`step_name` text NOT NULL,
	`step_type` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`duration_ms` integer,
	`output` text,
	`error_message` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `steps_execution_idx` ON `execution_steps` (`execution_id`);--> statement-breakpoint
CREATE INDEX `steps_number_idx` ON `execution_steps` (`execution_id`,`step_number`);--> statement-breakpoint
CREATE TABLE `cost_tracking` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`model_used` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL CHECK (`input_tokens` >= 0),
	`output_tokens` integer DEFAULT 0 NOT NULL CHECK (`output_tokens` >= 0),
	`input_cost_usd` real DEFAULT 0 NOT NULL CHECK (`input_cost_usd` >= 0),
	`output_cost_usd` real DEFAULT 0 NOT NULL CHECK (`output_cost_usd` >= 0),
	`total_cost_usd` real DEFAULT 0 NOT NULL CHECK (`total_cost_usd` >= 0),
	`request_id` text,
	`response_time_ms` integer,
	`cache_hit` integer DEFAULT 0 CHECK (`cache_hit` IN (0,1)),
	`timestamp` text NOT NULL,
	`year` integer NOT NULL CHECK(year BETWEEN 1 AND 9999),
	`month` integer NOT NULL CHECK(month BETWEEN 1 AND 12),
	`day` integer NOT NULL CHECK(day BETWEEN 1 AND 31),
	FOREIGN KEY (`execution_id`) REFERENCES `executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cost_execution_idx` ON `cost_tracking` (`execution_id`);--> statement-breakpoint
CREATE INDEX `cost_date_idx` ON `cost_tracking` (`year`,`month`,`day`);--> statement-breakpoint
CREATE INDEX `cost_monthly_idx` ON `cost_tracking` (`year`,`month`);--> statement-breakpoint
CREATE INDEX `cost_total_idx` ON `cost_tracking` (`total_cost_usd`);--> statement-breakpoint
CREATE TABLE `monthly_cost_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`total_cost_usd` real DEFAULT 0 NOT NULL,
	`total_executions` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`avg_cost_per_execution` real DEFAULT 0 NOT NULL,
	`avg_tokens_per_execution` real DEFAULT 0 NOT NULL,
	`cost_by_agent_type` text,
	`last_updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `summary_year_month_idx` ON `monthly_cost_summaries` (`year`,`month`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`agent_type` text NOT NULL,
	`cron_expression` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run` text,
	`last_run` text,
	`node_ids` text,
	`execution_config` text,
	`max_executions` integer,
	`executions_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agent_type`) REFERENCES `agent_configurations`(`agent_type`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `schedule_agent_type_idx` ON `schedules` (`agent_type`);--> statement-breakpoint
CREATE INDEX `schedule_enabled_idx` ON `schedules` (`enabled`);--> statement-breakpoint
CREATE INDEX `schedule_next_run_idx` ON `schedules` (`next_run`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`value_type` text DEFAULT 'string' NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`is_readonly` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_settings_key_unique` ON `app_settings` (`key`);--> statement-breakpoint
CREATE INDEX `settings_key_idx` ON `app_settings` (`key`);--> statement-breakpoint
CREATE INDEX `settings_category_idx` ON `app_settings` (`category`);--> statement-breakpoint
CREATE TABLE `system_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text DEFAULT 'localhost' NOT NULL,
	`cpu_usage_percent` real,
	`memory_usage_percent` real,
	`disk_usage_percent` real,
	`load_average_1m` real,
	`load_average_5m` real,
	`load_average_15m` real,
	`disk_free_bytes` integer,
	`disk_total_bytes` integer,
	`internet_connected` integer,
	`claude_api_latency_ms` integer,
	`overall_health` text DEFAULT 'healthy' NOT NULL,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `metrics_node_timestamp_idx` ON `system_metrics` (`node_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `metrics_health_idx` ON `system_metrics` (`overall_health`);--> statement-breakpoint
CREATE INDEX `metrics_timestamp_idx` ON `system_metrics` (`timestamp`);