CREATE TABLE `executions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','running','completed','failed','canceled')),
	`started_at` text NOT NULL,
	`completed_at` text,
	`duration_ms` integer,
	`cost_usd` real,
	`tokens_used` integer,
	`node_id` text,
	`triggered_by` text,
	`result_summary` text,
	`error_message` text,
	`exit_code` integer,
	`logs` text,
	`ai_analysis` text,
	`raw_output` text,
	`execution_context` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exec_status_idx` ON `executions` (`status`);--> statement-breakpoint
CREATE INDEX `exec_agent_type_idx` ON `executions` (`agent_type`);--> statement-breakpoint
CREATE INDEX `exec_started_at_idx` ON `executions` (`started_at`);--> statement-breakpoint
CREATE INDEX `exec_cost_idx` ON `executions` (`cost_usd`);--> statement-breakpoint
CREATE INDEX `exec_node_idx` ON `executions` (`node_id`);--> statement-breakpoint
CREATE INDEX `exec_status_agent_idx` ON `executions` (`status`,`agent_type`);--> statement-breakpoint
CREATE INDEX `exec_date_range_idx` ON `executions` (`started_at`,`completed_at`);--> statement-breakpoint
CREATE TABLE `agent_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_type` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL CHECK (`enabled` IN (0,1)),
	`config` text,
	`max_cost_per_execution` real,
	`max_duration_ms` integer,
	`timeout_ms` integer DEFAULT 300000,
	`max_concurrent_executions` integer DEFAULT 1,
	`cooldown_ms` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_configurations_agent_type_unique` ON `agent_configurations` (`agent_type`);--> statement-breakpoint
CREATE INDEX `config_agent_type_idx` ON `agent_configurations` (`agent_type`);--> statement-breakpoint
CREATE INDEX `config_enabled_idx` ON `agent_configurations` (`enabled`);