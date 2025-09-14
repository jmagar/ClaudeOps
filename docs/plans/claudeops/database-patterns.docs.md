# SQLite with Drizzle ORM Patterns for ClaudeOps

## Table of Contents
1. [Project Overview](#project-overview)
2. [Drizzle ORM File Structure](#drizzle-orm-file-structure)
3. [Database Configuration and Connection](#database-configuration-and-connection)
4. [Schema Definition Patterns](#schema-definition-patterns)
5. [Migration Strategies](#migration-strategies)
6. [Type-Safe Query Patterns](#type-safe-query-patterns)
7. [Execution Tracking Use Case Implementation](#execution-tracking-use-case-implementation)
8. [Performance Considerations](#performance-considerations)
9. [Best Practices](#best-practices)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Project Overview

This document outlines SQLite with Drizzle ORM patterns specifically for the ClaudeOps project, a Next.js 15.5.3 application with TypeScript. The focus is on creating a robust, type-safe database layer for tracking agent executions, cost management, and system operations.

### Technology Stack
- **Database**: SQLite with better-sqlite3 driver
- **ORM**: Drizzle ORM (latest 2024-2025 features)
- **Framework**: Next.js 15.5.3 with App Router
- **Runtime**: Node.js 22.x
- **Language**: TypeScript 5.7+

---

## Drizzle ORM File Structure

### Recommended Project Structure

```
src/
├── lib/
│   ├── db/
│   │   ├── index.ts              # Database connection and setup
│   │   ├── schema/
│   │   │   ├── index.ts          # Schema exports
│   │   │   ├── executions.ts     # Execution tracking tables
│   │   │   ├── agents.ts         # Agent configuration tables
│   │   │   ├── schedules.ts      # Scheduling tables
│   │   │   ├── costs.ts          # Cost tracking tables
│   │   │   └── system.ts         # System metadata tables
│   │   ├── queries/
│   │   │   ├── executions.ts     # Execution-related queries
│   │   │   ├── agents.ts         # Agent-related queries
│   │   │   ├── costs.ts          # Cost analysis queries
│   │   │   └── analytics.ts      # Dashboard analytics queries
│   │   ├── migrations/
│   │   │   └── 0000_initial.sql  # Migration files
│   │   └── types.ts              # Database type definitions
├── drizzle/                      # Generated migration files
├── data/                         # SQLite database storage
└── drizzle.config.ts             # Drizzle Kit configuration
```

### Core Database Files

**`src/lib/db/index.ts`** - Main database connection
```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

// Database file path
const dbPath = process.env.NODE_ENV === 'production' 
  ? path.join(process.cwd(), 'data', 'production.db')
  : path.join(process.cwd(), 'data', 'development.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite connection
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = 1000000');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('temp_store = MEMORY');

// Initialize Drizzle ORM
export const db = drizzle(sqlite, { 
  schema,
  logger: process.env.NODE_ENV === 'development'
});

// Run migrations on startup
export async function initializeDatabase() {
  try {
    migrate(db, { migrationsFolder: 'drizzle' });
    console.log('✅ Database migrations completed');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    throw error;
  }
}

// Graceful shutdown
export function closeDatabase() {
  sqlite.close();
}

// Health check
export function isDatabaseHealthy(): boolean {
  try {
    sqlite.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}
```

**`drizzle.config.ts`** - Drizzle Kit configuration
```typescript
import { defineConfig } from 'drizzle-kit';
import path from 'path';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.NODE_ENV === 'production' 
      ? path.join(process.cwd(), 'data', 'production.db')
      : path.join(process.cwd(), 'data', 'development.db')
  },
  verbose: true,
  strict: true,
  migrations: {
    table: '__drizzle_migrations',
  },
});
```

---

## Database Configuration and Connection

### Connection Management Patterns

**Singleton Connection Pattern**
```typescript
// src/lib/db/connection.ts
class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: ReturnType<typeof drizzle>;
  private sqlite: Database.Database;

  private constructor() {
    this.sqlite = new Database(this.getDbPath());
    this.configureSQLite();
    this.db = drizzle(this.sqlite, { schema });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private getDbPath(): string {
    const dbName = process.env.NODE_ENV === 'production' 
      ? 'production.db' 
      : 'development.db';
    return path.join(process.cwd(), 'data', dbName);
  }

  private configureSQLite(): void {
    // WAL mode for better concurrency
    this.sqlite.pragma('journal_mode = WAL');
    
    // Optimize for performance
    this.sqlite.pragma('synchronous = NORMAL');
    this.sqlite.pragma('cache_size = 1000000');
    this.sqlite.pragma('temp_store = MEMORY');
    
    // Enable foreign keys
    this.sqlite.pragma('foreign_keys = ON');
    
    // Set busy timeout for concurrent access
    this.sqlite.pragma('busy_timeout = 5000');
  }

  public getDb() {
    return this.db;
  }

  public close(): void {
    this.sqlite.close();
  }

  public healthCheck(): boolean {
    try {
      this.sqlite.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }
}

export const dbConnection = DatabaseConnection.getInstance();
export const db = dbConnection.getDb();
```

### Environment-Based Configuration

```typescript
// src/lib/db/config.ts
export interface DatabaseConfig {
  path: string;
  backupPath?: string;
  maxConnections: number;
  busyTimeout: number;
  journalMode: 'WAL' | 'DELETE' | 'TRUNCATE';
  synchronous: 'OFF' | 'NORMAL' | 'FULL';
  cacheSize: number;
}

export function getDatabaseConfig(): DatabaseConfig {
  const baseConfig: DatabaseConfig = {
    path: path.join(process.cwd(), 'data', 'development.db'),
    maxConnections: 10,
    busyTimeout: 5000,
    journalMode: 'WAL',
    synchronous: 'NORMAL',
    cacheSize: 1000000,
  };

  if (process.env.NODE_ENV === 'production') {
    return {
      ...baseConfig,
      path: path.join(process.cwd(), 'data', 'production.db'),
      backupPath: path.join(process.cwd(), 'backups'),
      synchronous: 'NORMAL',
      cacheSize: 2000000,
    };
  }

  if (process.env.NODE_ENV === 'test') {
    return {
      ...baseConfig,
      path: ':memory:',
      journalMode: 'DELETE',
      synchronous: 'OFF',
    };
  }

  return baseConfig;
}
```

---

## Schema Definition Patterns

### Core Execution Tracking Schema

**`src/lib/db/schema/executions.ts`**
```typescript
import { 
  sqliteTable, 
  text, 
  integer, 
  real, 
  blob,
  index 
} from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { sql } from 'drizzle-orm';

export const executions = sqliteTable('executions', {
  // Primary identification
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  // Execution metadata
  agentType: text('agent_type').notNull(),
  status: text('status', { 
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] 
  }).notNull().default('pending'),
  
  // Timing information
  startedAt: text('started_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
  
  // Cost tracking
  costUsd: real('cost_usd'),
  tokensUsed: integer('tokens_used'),
  
  // Execution context
  nodeId: text('node_id'), // For future remote execution
  triggeredBy: text('triggered_by'), // 'manual', 'schedule', 'webhook'
  
  // Results and logs
  resultSummary: text('result_summary'),
  errorMessage: text('error_message'),
  exitCode: integer('exit_code'),
  
  // Large data stored as JSON
  logs: text('logs'), // JSON array of log entries
  aiAnalysis: text('ai_analysis'), // JSON object from Claude
  rawOutput: text('raw_output'), // Complete execution output
  executionContext: text('execution_context'), // JSON metadata
  
  // Metadata
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  statusIdx: index('status_idx').on(table.status),
  agentTypeIdx: index('agent_type_idx').on(table.agentType),
  startedAtIdx: index('started_at_idx').on(table.startedAt),
  costIdx: index('cost_idx').on(table.costUsd),
  nodeIdx: index('node_idx').on(table.nodeId),
  
  // Composite indexes for common queries
  statusAgentIdx: index('status_agent_idx').on(table.status, table.agentType),
  dateRangeIdx: index('date_range_idx').on(table.startedAt, table.completedAt),
}));

// Execution steps for detailed tracking
export const executionSteps = sqliteTable('execution_steps', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  executionId: text('execution_id').notNull()
    .references(() => executions.id, { onDelete: 'cascade' }),
  
  stepNumber: integer('step_number').notNull(),
  stepName: text('step_name').notNull(),
  stepType: text('step_type'), // 'command', 'analysis', 'cleanup'
  
  status: text('status', { 
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'] 
  }).notNull().default('pending'),
  
  startedAt: text('started_at')
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
  
  output: text('output'),
  errorMessage: text('error_message'),
  metadata: text('metadata'), // JSON
  
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  executionIdx: index('execution_idx').on(table.executionId),
  stepNumberIdx: index('step_number_idx').on(table.executionId, table.stepNumber),
}));
```

**`src/lib/db/schema/agents.ts`**
```typescript
import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const agentConfigurations = sqliteTable('agent_configurations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  // Agent identification
  agentType: text('agent_type').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  
  // Configuration
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config'), // JSON configuration
  
  // Cost and resource limits
  maxCostPerExecution: real('max_cost_per_execution'),
  maxDurationMs: integer('max_duration_ms'),
  timeoutMs: integer('timeout_ms').default(300000), // 5 minutes default
  
  // Execution constraints
  maxConcurrentExecutions: integer('max_concurrent_executions').default(1),
  cooldownMs: integer('cooldown_ms').default(0),
  
  // Metadata
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  agentTypeIdx: index('agent_type_idx').on(table.agentType),
  enabledIdx: index('enabled_idx').on(table.enabled),
}));
```

**`src/lib/db/schema/costs.ts`**
```typescript
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const costTracking = sqliteTable('cost_tracking', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  executionId: text('execution_id')
    .references(() => executions.id, { onDelete: 'cascade' }),
  
  // Cost breakdown
  modelUsed: text('model_used').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  inputCostUsd: real('input_cost_usd').notNull().default(0),
  outputCostUsd: real('output_cost_usd').notNull().default(0),
  totalCostUsd: real('total_cost_usd').notNull().default(0),
  
  // Claude SDK metadata
  requestId: text('request_id'),
  responseTime: integer('response_time_ms'),
  cacheHit: integer('cache_hit', { mode: 'boolean' }).default(false),
  
  // Timestamps
  timestamp: text('timestamp').notNull()
    .$defaultFn(() => new Date().toISOString()),
    
  // Monthly aggregation fields
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  day: integer('day').notNull(),
}, (table) => ({
  executionIdx: index('execution_cost_idx').on(table.executionId),
  dateIdx: index('cost_date_idx').on(table.year, table.month, table.day),
  monthlyIdx: index('monthly_cost_idx').on(table.year, table.month),
  totalCostIdx: index('total_cost_idx').on(table.totalCostUsd),
}));

// Monthly cost summaries for fast dashboard queries
export const monthlyCostSummaries = sqliteTable('monthly_cost_summaries', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  
  totalCostUsd: real('total_cost_usd').notNull().default(0),
  totalExecutions: integer('total_executions').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  
  avgCostPerExecution: real('avg_cost_per_execution').notNull().default(0),
  avgTokensPerExecution: real('avg_tokens_per_execution').notNull().default(0),
  
  // Agent type breakdown (JSON)
  costByAgentType: text('cost_by_agent_type'), // JSON object
  
  lastUpdated: text('last_updated').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  yearMonthIdx: index('year_month_idx').on(table.year, table.month),
}));
```

**`src/lib/db/schema/schedules.ts`**
```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  // Schedule identification
  name: text('name').notNull(),
  agentType: text('agent_type').notNull()
    .references(() => agentConfigurations.agentType),
  
  // Cron configuration
  cronExpression: text('cron_expression').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  
  // Schedule state
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  nextRun: text('next_run'),
  lastRun: text('last_run'),
  
  // Execution context
  nodeIds: text('node_ids'), // JSON array for future multi-node
  executionConfig: text('execution_config'), // JSON override config
  
  // Limits and controls
  maxExecutions: integer('max_executions'), // null = unlimited
  executionsCount: integer('executions_count').notNull().default(0),
  
  // Metadata
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  agentTypeIdx: index('schedule_agent_type_idx').on(table.agentType),
  enabledIdx: index('schedule_enabled_idx').on(table.enabled),
  nextRunIdx: index('next_run_idx').on(table.nextRun),
}));
```

**`src/lib/db/schema/system.ts`**
```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

// System health metrics
export const systemMetrics = sqliteTable('system_metrics', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  nodeId: text('node_id').notNull().default('localhost'),
  
  // Resource metrics
  cpuUsagePercent: real('cpu_usage_percent'),
  memoryUsagePercent: real('memory_usage_percent'),
  diskUsagePercent: real('disk_usage_percent'),
  
  // System load
  loadAverage1m: real('load_average_1m'),
  loadAverage5m: real('load_average_5m'),
  loadAverage15m: real('load_average_15m'),
  
  // Storage metrics
  diskFreeBytes: integer('disk_free_bytes'),
  diskTotalBytes: integer('disk_total_bytes'),
  
  // Network connectivity
  internetConnected: integer('internet_connected', { mode: 'boolean' }),
  claudeApiLatencyMs: integer('claude_api_latency_ms'),
  
  // Health status
  overallHealth: text('overall_health', { 
    enum: ['healthy', 'warning', 'critical'] 
  }).notNull().default('healthy'),
  
  timestamp: text('timestamp').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  nodeTimestampIdx: index('node_timestamp_idx').on(table.nodeId, table.timestamp),
  healthIdx: index('health_idx').on(table.overallHealth),
  timestampIdx: index('system_timestamp_idx').on(table.timestamp),
}));

// Application configuration and settings
export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  
  // Type information for validation
  valueType: text('value_type', { 
    enum: ['string', 'number', 'boolean', 'json'] 
  }).notNull().default('string'),
  
  // Configuration category
  category: text('category').notNull().default('general'),
  
  // Access control
  isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
  isReadonly: integer('is_readonly', { mode: 'boolean' }).notNull().default(false),
  
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  keyIdx: index('settings_key_idx').on(table.key),
  categoryIdx: index('settings_category_idx').on(table.category),
}));
```

**`src/lib/db/schema/index.ts`** - Schema exports
```typescript
export * from './executions';
export * from './agents';
export * from './costs';
export * from './schedules';
export * from './system';

// Relations for Drizzle queries
import { relations } from 'drizzle-orm';
import { 
  executions, 
  executionSteps, 
  agentConfigurations, 
  costTracking,
  schedules 
} from './';

export const executionsRelations = relations(executions, ({ many, one }) => ({
  steps: many(executionSteps),
  costBreakdown: many(costTracking),
  agentConfig: one(agentConfigurations, {
    fields: [executions.agentType],
    references: [agentConfigurations.agentType],
  }),
}));

export const executionStepsRelations = relations(executionSteps, ({ one }) => ({
  execution: one(executions, {
    fields: [executionSteps.executionId],
    references: [executions.id],
  }),
}));

export const costTrackingRelations = relations(costTracking, ({ one }) => ({
  execution: one(executions, {
    fields: [costTracking.executionId],
    references: [executions.id],
  }),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  agentConfig: one(agentConfigurations, {
    fields: [schedules.agentType],
    references: [agentConfigurations.agentType],
  }),
}));
```

---

## Migration Strategies

### Migration Workflow

**Initial Migration Generation**
```bash
# Generate migration from schema
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate
```

**Migration File Example** - `drizzle/0000_initial.sql`
```sql
CREATE TABLE `executions` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_type` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
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
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE INDEX `status_idx` ON `executions` (`status`);
CREATE INDEX `agent_type_idx` ON `executions` (`agent_type`);
CREATE INDEX `started_at_idx` ON `executions` (`started_at`);
CREATE INDEX `cost_idx` ON `executions` (`cost_usd`);
CREATE INDEX `node_idx` ON `executions` (`node_id`);
CREATE INDEX `status_agent_idx` ON `executions` (`status`,`agent_type`);
CREATE INDEX `date_range_idx` ON `executions` (`started_at`,`completed_at`);

-- Enable foreign key checks
PRAGMA foreign_keys=ON;

-- Create triggers for updated_at
CREATE TRIGGER update_executions_updated_at 
  AFTER UPDATE ON executions
BEGIN
  UPDATE executions SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

### Custom Migration Scripts

**`src/lib/db/migrations/migrate.ts`**
```typescript
import { db } from '../index';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';

export interface MigrationResult {
  success: boolean;
  appliedMigrations: number;
  error?: string;
}

export async function runMigrations(): Promise<MigrationResult> {
  try {
    const migrationsPath = path.join(process.cwd(), 'drizzle');
    
    // Ensure migrations directory exists
    if (!fs.existsSync(migrationsPath)) {
      return {
        success: false,
        appliedMigrations: 0,
        error: 'Migrations directory not found'
      };
    }

    // Run migrations
    await migrate(db, { 
      migrationsFolder: migrationsPath 
    });

    // Count applied migrations
    const migrationFiles = fs.readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql')).length;

    return {
      success: true,
      appliedMigrations: migrationFiles
    };
  } catch (error) {
    return {
      success: false,
      appliedMigrations: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Development helper for fresh database
export async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot reset production database');
  }

  const dbPath = path.join(process.cwd(), 'data', 'development.db');
  
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  await runMigrations();
}
```

### Backup and Recovery

**`src/lib/db/backup.ts`**
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

export interface BackupOptions {
  destination?: string;
  compress?: boolean;
  includeWAL?: boolean;
}

export async function createBackup(options: BackupOptions = {}): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}.db`;
  
  const backupDir = options.destination || path.join(process.cwd(), 'backups');
  const backupPath = path.join(backupDir, backupName);
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const sourcePath = path.join(process.cwd(), 'data', 
    process.env.NODE_ENV === 'production' ? 'production.db' : 'development.db'
  );

  if (!fs.existsSync(sourcePath)) {
    throw new Error('Source database not found');
  }

  // Use SQLite backup API for consistent backup
  const source = new Database(sourcePath, { readonly: true });
  const destination = new Database(backupPath);

  await new Promise<void>((resolve, reject) => {
    source.backup(destination, (progress) => {
      if (progress.totalPages === progress.remainingPages) {
        console.log('Backup started...');
      }
      if (progress.remainingPages === 0) {
        console.log('Backup completed');
        resolve();
      }
    }).catch(reject);
  });

  source.close();
  destination.close();

  return backupPath;
}

export async function restoreBackup(backupPath: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot restore in production without explicit confirmation');
  }

  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found');
  }

  const targetPath = path.join(process.cwd(), 'data', 'development.db');
  
  // Copy backup to target location
  fs.copyFileSync(backupPath, targetPath);
  
  console.log(`Database restored from ${backupPath}`);
}

// Automatic daily backups
export function scheduleAutomaticBackups(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const interval = 24 * 60 * 60 * 1000; // 24 hours
  
  setInterval(async () => {
    try {
      const backupPath = await createBackup();
      console.log(`Automatic backup created: ${backupPath}`);
      
      // Clean old backups (keep last 7 days)
      cleanOldBackups(7);
    } catch (error) {
      console.error('Automatic backup failed:', error);
    }
  }, interval);
}

function cleanOldBackups(keepDays: number): void {
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) return;

  const cutoffTime = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
  
  fs.readdirSync(backupDir)
    .filter(file => file.startsWith('backup-') && file.endsWith('.db'))
    .forEach(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < cutoffTime) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old backup: ${file}`);
      }
    });
}
```

---

## Type-Safe Query Patterns

### Execution Queries

**`src/lib/db/queries/executions.ts`**
```typescript
import { db } from '../index';
import { 
  executions, 
  executionSteps, 
  costTracking, 
  agentConfigurations 
} from '../schema';
import { and, eq, desc, gte, lte, isNull, sql, count } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Type definitions for queries
export interface ExecutionFilter {
  agentType?: string;
  status?: typeof executions.$inferSelect.status;
  dateFrom?: Date;
  dateTo?: Date;
  nodeId?: string;
  limit?: number;
  offset?: number;
}

export interface CreateExecutionInput {
  agentType: string;
  nodeId?: string;
  triggeredBy?: string;
  executionContext?: any;
}

export interface UpdateExecutionInput {
  status?: typeof executions.$inferSelect.status;
  completedAt?: string;
  durationMs?: number;
  costUsd?: number;
  tokensUsed?: number;
  resultSummary?: string;
  errorMessage?: string;
  exitCode?: number;
  logs?: any;
  aiAnalysis?: any;
  rawOutput?: string;
}

// Query functions
export async function createExecution(input: CreateExecutionInput) {
  const execution = await db.insert(executions).values({
    id: createId(),
    agentType: input.agentType,
    nodeId: input.nodeId || 'localhost',
    triggeredBy: input.triggeredBy || 'manual',
    executionContext: input.executionContext ? 
      JSON.stringify(input.executionContext) : null,
  }).returning();

  return execution[0];
}

export async function updateExecution(
  executionId: string, 
  updates: UpdateExecutionInput
) {
  const execution = await db.update(executions)
    .set({
      ...updates,
      logs: updates.logs ? JSON.stringify(updates.logs) : undefined,
      aiAnalysis: updates.aiAnalysis ? JSON.stringify(updates.aiAnalysis) : undefined,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(executions.id, executionId))
    .returning();

  return execution[0];
}

export async function getExecutions(filter: ExecutionFilter = {}) {
  const conditions = [];
  
  if (filter.agentType) {
    conditions.push(eq(executions.agentType, filter.agentType));
  }
  
  if (filter.status) {
    conditions.push(eq(executions.status, filter.status));
  }
  
  if (filter.dateFrom) {
    conditions.push(gte(executions.startedAt, filter.dateFrom.toISOString()));
  }
  
  if (filter.dateTo) {
    conditions.push(lte(executions.startedAt, filter.dateTo.toISOString()));
  }
  
  if (filter.nodeId) {
    conditions.push(eq(executions.nodeId, filter.nodeId));
  }

  let query = db.select().from(executions);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  query = query.orderBy(desc(executions.startedAt));
  
  if (filter.limit) {
    query = query.limit(filter.limit);
  }
  
  if (filter.offset) {
    query = query.offset(filter.offset);
  }

  return await query;
}

export async function getExecutionWithDetails(executionId: string) {
  const result = await db.query.executions.findFirst({
    where: eq(executions.id, executionId),
    with: {
      steps: {
        orderBy: (steps, { asc }) => [asc(steps.stepNumber)],
      },
      costBreakdown: true,
      agentConfig: true,
    },
  });

  if (!result) return null;

  // Parse JSON fields
  return {
    ...result,
    logs: result.logs ? JSON.parse(result.logs) : null,
    aiAnalysis: result.aiAnalysis ? JSON.parse(result.aiAnalysis) : null,
    executionContext: result.executionContext ? 
      JSON.parse(result.executionContext) : null,
  };
}

export async function getRunningExecutions() {
  return await db.select()
    .from(executions)
    .where(eq(executions.status, 'running'))
    .orderBy(desc(executions.startedAt));
}

export async function getExecutionStats(agentType?: string) {
  const baseQuery = db.select({
    total: count(),
    avgDuration: sql<number>`AVG(duration_ms)`,
    avgCost: sql<number>`AVG(cost_usd)`,
    successRate: sql<number>`
      (COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0) / COUNT(*)
    `,
  }).from(executions);

  if (agentType) {
    return await baseQuery.where(eq(executions.agentType, agentType));
  }

  return await baseQuery;
}

// Real-time execution tracking
export async function addExecutionStep(
  executionId: string,
  stepData: {
    stepNumber: number;
    stepName: string;
    stepType?: string;
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    output?: string;
    errorMessage?: string;
    metadata?: any;
  }
) {
  return await db.insert(executionSteps).values({
    id: createId(),
    executionId,
    ...stepData,
    metadata: stepData.metadata ? JSON.stringify(stepData.metadata) : null,
  }).returning();
}

export async function updateExecutionStep(
  stepId: string,
  updates: {
    status?: typeof executionSteps.$inferSelect.status;
    completedAt?: string;
    durationMs?: number;
    output?: string;
    errorMessage?: string;
  }
) {
  return await db.update(executionSteps)
    .set(updates)
    .where(eq(executionSteps.id, stepId))
    .returning();
}
```

### Cost Analysis Queries

**`src/lib/db/queries/costs.ts`**
```typescript
import { db } from '../index';
import { costTracking, monthlyCostSummaries, executions } from '../schema';
import { and, eq, gte, lte, sum, count, sql, desc } from 'drizzle-orm';

export interface CostAnalysisFilter {
  dateFrom?: Date;
  dateTo?: Date;
  agentType?: string;
  modelUsed?: string;
}

export async function recordCost(data: {
  executionId: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  requestId?: string;
  responseTime?: number;
  cacheHit?: boolean;
}) {
  const now = new Date();
  
  return await db.insert(costTracking).values({
    ...data,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    timestamp: now.toISOString(),
  }).returning();
}

export async function getCurrentMonthCost() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const result = await db.select({
    totalCost: sum(costTracking.totalCostUsd),
    totalExecutions: count(),
    totalTokens: sql<number>`SUM(input_tokens + output_tokens)`,
  })
  .from(costTracking)
  .where(and(
    eq(costTracking.year, year),
    eq(costTracking.month, month)
  ));

  return result[0] || { totalCost: 0, totalExecutions: 0, totalTokens: 0 };
}

export async function getCostAnalysis(filter: CostAnalysisFilter = {}) {
  let query = db.select({
    date: costTracking.timestamp,
    agentType: executions.agentType,
    modelUsed: costTracking.modelUsed,
    totalCost: costTracking.totalCostUsd,
    inputTokens: costTracking.inputTokens,
    outputTokens: costTracking.outputTokens,
    cacheHit: costTracking.cacheHit,
  })
  .from(costTracking)
  .leftJoin(executions, eq(costTracking.executionId, executions.id));

  const conditions = [];
  
  if (filter.dateFrom) {
    conditions.push(gte(costTracking.timestamp, filter.dateFrom.toISOString()));
  }
  
  if (filter.dateTo) {
    conditions.push(lte(costTracking.timestamp, filter.dateTo.toISOString()));
  }
  
  if (filter.agentType) {
    conditions.push(eq(executions.agentType, filter.agentType));
  }
  
  if (filter.modelUsed) {
    conditions.push(eq(costTracking.modelUsed, filter.modelUsed));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return await query.orderBy(desc(costTracking.timestamp));
}

export async function getCostTrends(months: number = 12) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  return await db.select({
    year: costTracking.year,
    month: costTracking.month,
    totalCost: sum(costTracking.totalCostUsd),
    totalExecutions: count(),
    avgCostPerExecution: sql<number>`AVG(total_cost_usd)`,
  })
  .from(costTracking)
  .where(and(
    gte(costTracking.timestamp, startDate.toISOString()),
    lte(costTracking.timestamp, endDate.toISOString())
  ))
  .groupBy(costTracking.year, costTracking.month)
  .orderBy(desc(costTracking.year), desc(costTracking.month));
}

export async function updateMonthlySummary(year: number, month: number) {
  // Calculate monthly aggregates
  const stats = await db.select({
    totalCost: sum(costTracking.totalCostUsd),
    totalExecutions: count(),
    totalTokens: sql<number>`SUM(input_tokens + output_tokens)`,
    avgCostPerExecution: sql<number>`AVG(total_cost_usd)`,
    avgTokensPerExecution: sql<number>`AVG(input_tokens + output_tokens)`,
  })
  .from(costTracking)
  .where(and(
    eq(costTracking.year, year),
    eq(costTracking.month, month)
  ));

  // Get cost breakdown by agent type
  const agentCosts = await db.select({
    agentType: executions.agentType,
    totalCost: sum(costTracking.totalCostUsd),
  })
  .from(costTracking)
  .leftJoin(executions, eq(costTracking.executionId, executions.id))
  .where(and(
    eq(costTracking.year, year),
    eq(costTracking.month, month)
  ))
  .groupBy(executions.agentType);

  const costByAgentType = Object.fromEntries(
    agentCosts.map(ac => [ac.agentType || 'unknown', ac.totalCost || 0])
  );

  // Upsert monthly summary
  const summary = {
    year,
    month,
    totalCostUsd: stats[0]?.totalCost || 0,
    totalExecutions: stats[0]?.totalExecutions || 0,
    totalTokens: stats[0]?.totalTokens || 0,
    avgCostPerExecution: stats[0]?.avgCostPerExecution || 0,
    avgTokensPerExecution: stats[0]?.avgTokensPerExecution || 0,
    costByAgentType: JSON.stringify(costByAgentType),
    lastUpdated: new Date().toISOString(),
  };

  // Check if summary exists
  const existing = await db.select()
    .from(monthlyCostSummaries)
    .where(and(
      eq(monthlyCostSummaries.year, year),
      eq(monthlyCostSummaries.month, month)
    ));

  if (existing.length > 0) {
    return await db.update(monthlyCostSummaries)
      .set(summary)
      .where(and(
        eq(monthlyCostSummaries.year, year),
        eq(monthlyCostSummaries.month, month)
      ))
      .returning();
  } else {
    return await db.insert(monthlyCostSummaries)
      .values(summary)
      .returning();
  }
}
```

### Dashboard Analytics Queries

**`src/lib/db/queries/analytics.ts`**
```typescript
import { db } from '../index';
import { 
  executions, 
  costTracking, 
  systemMetrics, 
  agentConfigurations 
} from '../schema';
import { and, eq, gte, lte, sum, count, avg, sql, desc } from 'drizzle-orm';

export interface DashboardStats {
  executionStats: {
    total: number;
    running: number;
    completed: number;
    failed: number;
    completionRate: number;
  };
  costStats: {
    currentMonth: number;
    lastMonth: number;
    averagePerExecution: number;
    totalTokens: number;
  };
  performanceStats: {
    averageDuration: number;
    fastestExecution: number;
    slowestExecution: number;
  };
  systemHealth: {
    status: 'healthy' | 'warning' | 'critical';
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // Execution statistics
  const executionStats = await db.select({
    total: count(),
    running: sql<number>`COUNT(CASE WHEN status = 'running' THEN 1 END)`,
    completed: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
    failed: sql<number>`COUNT(CASE WHEN status = 'failed' THEN 1 END)`,
  }).from(executions);

  const completionRate = executionStats[0]?.total > 0 ? 
    (executionStats[0].completed / executionStats[0].total) * 100 : 0;

  // Current month cost
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [currentMonthCost] = await db.select({
    total: sum(costTracking.totalCostUsd),
    avgPerExecution: avg(costTracking.totalCostUsd),
    totalTokens: sql<number>`SUM(input_tokens + output_tokens)`,
  })
  .from(costTracking)
  .where(gte(costTracking.timestamp, currentMonthStart.toISOString()));

  const [lastMonthCost] = await db.select({
    total: sum(costTracking.totalCostUsd),
  })
  .from(costTracking)
  .where(and(
    gte(costTracking.timestamp, lastMonthStart.toISOString()),
    lte(costTracking.timestamp, lastMonthEnd.toISOString())
  ));

  // Performance statistics
  const [perfStats] = await db.select({
    avgDuration: avg(executions.durationMs),
    minDuration: sql<number>`MIN(duration_ms)`,
    maxDuration: sql<number>`MAX(duration_ms)`,
  })
  .from(executions)
  .where(eq(executions.status, 'completed'));

  // Latest system health
  const [systemHealth] = await db.select()
    .from(systemMetrics)
    .orderBy(desc(systemMetrics.timestamp))
    .limit(1);

  return {
    executionStats: {
      total: executionStats[0]?.total || 0,
      running: executionStats[0]?.running || 0,
      completed: executionStats[0]?.completed || 0,
      failed: executionStats[0]?.failed || 0,
      completionRate,
    },
    costStats: {
      currentMonth: currentMonthCost?.total || 0,
      lastMonth: lastMonthCost?.total || 0,
      averagePerExecution: currentMonthCost?.avgPerExecution || 0,
      totalTokens: currentMonthCost?.totalTokens || 0,
    },
    performanceStats: {
      averageDuration: perfStats?.avgDuration || 0,
      fastestExecution: perfStats?.minDuration || 0,
      slowestExecution: perfStats?.maxDuration || 0,
    },
    systemHealth: {
      status: systemHealth?.overallHealth || 'healthy',
      cpuUsage: systemHealth?.cpuUsagePercent || 0,
      memoryUsage: systemHealth?.memoryUsagePercent || 0,
      diskUsage: systemHealth?.diskUsagePercent || 0,
    },
  };
}

export async function getRecentActivity(limit: number = 10) {
  return await db.select({
    id: executions.id,
    agentType: executions.agentType,
    status: executions.status,
    startedAt: executions.startedAt,
    completedAt: executions.completedAt,
    durationMs: executions.durationMs,
    costUsd: executions.costUsd,
    resultSummary: executions.resultSummary,
  })
  .from(executions)
  .orderBy(desc(executions.startedAt))
  .limit(limit);
}

export async function getAgentPerformance() {
  return await db.select({
    agentType: executions.agentType,
    totalExecutions: count(),
    successfulExecutions: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
    failedExecutions: sql<number>`COUNT(CASE WHEN status = 'failed' THEN 1 END)`,
    avgDuration: avg(executions.durationMs),
    totalCost: sum(executions.costUsd),
    avgCost: avg(executions.costUsd),
    lastExecuted: sql<string>`MAX(started_at)`,
  })
  .from(executions)
  .groupBy(executions.agentType)
  .orderBy(desc(count()));
}

export async function getCostTrendData(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await db.select({
    date: sql<string>`DATE(timestamp)`,
    totalCost: sum(costTracking.totalCostUsd),
    executionCount: count(),
    avgCostPerExecution: avg(costTracking.totalCostUsd),
  })
  .from(costTracking)
  .where(gte(costTracking.timestamp, startDate.toISOString()))
  .groupBy(sql`DATE(timestamp)`)
  .orderBy(sql`DATE(timestamp)`);
}
```

---

## Execution Tracking Use Case Implementation

### Agent Execution Tracking Service

**`src/lib/services/executionTracker.ts`**
```typescript
import { db } from '../db';
import { 
  createExecution, 
  updateExecution, 
  addExecutionStep, 
  updateExecutionStep,
  recordCost 
} from '../db/queries/executions';
import { EventEmitter } from 'events';

export interface ExecutionContext {
  agentType: string;
  nodeId?: string;
  triggeredBy?: 'manual' | 'schedule' | 'webhook';
  config?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ExecutionStep {
  name: string;
  type?: 'command' | 'analysis' | 'cleanup' | 'validation';
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  aiAnalysis?: any;
  costData?: {
    totalCostUsd: number;
    tokensUsed: number;
    model: string;
  };
}

export class ExecutionTracker extends EventEmitter {
  private executionId: string;
  private startTime: Date;
  private currentStepNumber: number = 0;
  private steps: Map<number, string> = new Map();

  constructor(private context: ExecutionContext) {
    super();
    this.startTime = new Date();
  }

  async start(): Promise<string> {
    const execution = await createExecution({
      agentType: this.context.agentType,
      nodeId: this.context.nodeId || 'localhost',
      triggeredBy: this.context.triggeredBy || 'manual',
      executionContext: {
        config: this.context.config,
        metadata: this.context.metadata,
      },
    });

    this.executionId = execution.id;

    // Update status to running
    await updateExecution(this.executionId, {
      status: 'running',
    });

    this.emit('execution:started', {
      executionId: this.executionId,
      agentType: this.context.agentType,
      startedAt: this.startTime.toISOString(),
    });

    return this.executionId;
  }

  async addStep(step: ExecutionStep): Promise<void> {
    this.currentStepNumber++;
    
    const stepRecord = await addExecutionStep(this.executionId, {
      stepNumber: this.currentStepNumber,
      stepName: step.name,
      stepType: step.type,
      status: 'pending',
      metadata: step.metadata,
    });

    this.steps.set(this.currentStepNumber, stepRecord[0].id);

    this.emit('execution:step:added', {
      executionId: this.executionId,
      stepNumber: this.currentStepNumber,
      stepName: step.name,
    });
  }

  async startStep(stepNumber: number): Promise<void> {
    const stepId = this.steps.get(stepNumber);
    if (!stepId) throw new Error(`Step ${stepNumber} not found`);

    await updateExecutionStep(stepId, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    this.emit('execution:step:started', {
      executionId: this.executionId,
      stepNumber,
      stepId,
    });
  }

  async completeStep(
    stepNumber: number, 
    result: { output?: string; error?: string; metadata?: any }
  ): Promise<void> {
    const stepId = this.steps.get(stepNumber);
    if (!stepId) throw new Error(`Step ${stepNumber} not found`);

    const completedAt = new Date().toISOString();
    const stepStartTime = await this.getStepStartTime(stepId);
    const durationMs = stepStartTime ? 
      Date.now() - new Date(stepStartTime).getTime() : null;

    await updateExecutionStep(stepId, {
      status: result.error ? 'failed' : 'completed',
      completedAt,
      durationMs: durationMs || undefined,
      output: result.output,
      errorMessage: result.error,
    });

    this.emit('execution:step:completed', {
      executionId: this.executionId,
      stepNumber,
      stepId,
      success: !result.error,
      output: result.output,
      error: result.error,
    });
  }

  async addLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      stepNumber: this.currentStepNumber || null,
    };

    this.emit('execution:log', {
      executionId: this.executionId,
      ...logEntry,
    });

    // Store logs will be handled by the complete() method
  }

  async recordCost(costData: {
    modelUsed: string;
    inputTokens: number;
    outputTokens: number;
    inputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
    requestId?: string;
    responseTime?: number;
    cacheHit?: boolean;
  }): Promise<void> {
    await recordCost({
      executionId: this.executionId,
      ...costData,
    });

    this.emit('execution:cost:recorded', {
      executionId: this.executionId,
      cost: costData.totalCostUsd,
      tokens: costData.inputTokens + costData.outputTokens,
    });
  }

  async complete(result: ExecutionResult): Promise<void> {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - this.startTime.getTime();

    await updateExecution(this.executionId, {
      status: result.success ? 'completed' : 'failed',
      completedAt,
      durationMs,
      resultSummary: this.generateResultSummary(result),
      errorMessage: result.error,
      exitCode: result.success ? 0 : 1,
      aiAnalysis: result.aiAnalysis,
      costUsd: result.costData?.totalCostUsd,
      tokensUsed: result.costData?.tokensUsed,
    });

    this.emit('execution:completed', {
      executionId: this.executionId,
      success: result.success,
      durationMs,
      cost: result.costData?.totalCostUsd,
      error: result.error,
    });
  }

  async fail(error: string, exitCode: number = 1): Promise<void> {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - this.startTime.getTime();

    await updateExecution(this.executionId, {
      status: 'failed',
      completedAt,
      durationMs,
      errorMessage: error,
      exitCode,
    });

    this.emit('execution:failed', {
      executionId: this.executionId,
      error,
      exitCode,
      durationMs,
    });
  }

  private async getStepStartTime(stepId: string): Promise<string | null> {
    const step = await db.query.executionSteps.findFirst({
      where: (steps, { eq }) => eq(steps.id, stepId),
    });
    
    return step?.startedAt || null;
  }

  private generateResultSummary(result: ExecutionResult): string {
    if (!result.success) {
      return `Execution failed: ${result.error}`;
    }

    const parts = ['Execution completed successfully'];
    
    if (result.costData) {
      parts.push(`Cost: $${result.costData.totalCostUsd.toFixed(4)}`);
      parts.push(`Tokens: ${result.costData.tokensUsed}`);
    }

    if (this.currentStepNumber > 0) {
      parts.push(`Steps: ${this.currentStepNumber}`);
    }

    return parts.join(' | ');
  }

  getExecutionId(): string {
    return this.executionId;
  }

  getDuration(): number {
    return Date.now() - this.startTime.getTime();
  }
}

// Factory function for creating trackers
export function createExecutionTracker(context: ExecutionContext): ExecutionTracker {
  return new ExecutionTracker(context);
}

// Global execution manager for tracking multiple concurrent executions
export class ExecutionManager extends EventEmitter {
  private activeExecutions: Map<string, ExecutionTracker> = new Map();

  async startExecution(context: ExecutionContext): Promise<ExecutionTracker> {
    const tracker = new ExecutionTracker(context);
    const executionId = await tracker.start();
    
    this.activeExecutions.set(executionId, tracker);
    
    // Forward all events from the tracker
    tracker.on('execution:completed', () => {
      this.activeExecutions.delete(executionId);
    });
    
    tracker.on('execution:failed', () => {
      this.activeExecutions.delete(executionId);
    });

    // Forward all events to manager listeners
    const events = [
      'execution:started', 'execution:step:added', 'execution:step:started',
      'execution:step:completed', 'execution:log', 'execution:cost:recorded',
      'execution:completed', 'execution:failed'
    ];

    events.forEach(event => {
      tracker.on(event, (data) => this.emit(event, data));
    });

    return tracker;
  }

  getActiveExecutions(): ExecutionTracker[] {
    return Array.from(this.activeExecutions.values());
  }

  getExecution(executionId: string): ExecutionTracker | undefined {
    return this.activeExecutions.get(executionId);
  }

  async cancelExecution(executionId: string): Promise<void> {
    const tracker = this.activeExecutions.get(executionId);
    if (tracker) {
      await tracker.fail('Execution cancelled by user', 130);
      this.activeExecutions.delete(executionId);
    }
  }

  getExecutionCount(): number {
    return this.activeExecutions.size;
  }
}

// Singleton execution manager
export const executionManager = new ExecutionManager();
```

### WebSocket Integration for Real-time Updates

**`src/lib/services/websocketManager.ts`**
```typescript
import { Server as SocketIOServer } from 'socket.io';
import { executionManager } from './executionTracker';
import { Server } from 'http';

export class WebSocketManager {
  private io: SocketIOServer;

  constructor(server: Server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NODE_ENV === 'development' ? "http://localhost:3000" : false,
        methods: ["GET", "POST"]
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Forward execution events to connected clients
    const events = [
      'execution:started',
      'execution:step:added',
      'execution:step:started', 
      'execution:step:completed',
      'execution:log',
      'execution:cost:recorded',
      'execution:completed',
      'execution:failed'
    ];

    events.forEach(event => {
      executionManager.on(event, (data) => {
        this.io.emit(event, data);
      });
    });

    // Handle client connections
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Send current active executions to new client
      socket.emit('active:executions', 
        executionManager.getActiveExecutions().map(tracker => ({
          executionId: tracker.getExecutionId(),
          duration: tracker.getDuration(),
        }))
      );

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });

      // Handle execution cancellation requests
      socket.on('cancel:execution', async (data: { executionId: string }) => {
        try {
          await executionManager.cancelExecution(data.executionId);
          socket.emit('execution:cancelled', { executionId: data.executionId });
        } catch (error) {
          socket.emit('error', { 
            message: 'Failed to cancel execution',
            executionId: data.executionId 
          });
        }
      });
    });
  }

  // Emit custom events
  emit(event: string, data: any): void {
    this.io.emit(event, data);
  }

  // Get connected client count
  getConnectedCount(): number {
    return this.io.sockets.sockets.size;
  }
}

let wsManager: WebSocketManager | null = null;

export function initializeWebSocket(server: Server): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager(server);
  }
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    throw new Error('WebSocket manager not initialized');
  }
  return wsManager;
}
```

---

## Performance Considerations

### Database Optimization

**Index Strategy**
```sql
-- Core execution queries
CREATE INDEX idx_executions_status_agent ON executions(status, agent_type);
CREATE INDEX idx_executions_date_range ON executions(started_at, completed_at);
CREATE INDEX idx_executions_cost ON executions(cost_usd) WHERE cost_usd IS NOT NULL;

-- Cost analysis queries
CREATE INDEX idx_cost_monthly ON cost_tracking(year, month);
CREATE INDEX idx_cost_daily ON cost_tracking(year, month, day);
CREATE INDEX idx_cost_execution ON cost_tracking(execution_id);

-- System metrics queries
CREATE INDEX idx_metrics_node_time ON system_metrics(node_id, timestamp);
CREATE INDEX idx_metrics_health ON system_metrics(overall_health, timestamp);
```

**Query Optimization Patterns**
```typescript
// src/lib/db/optimizations.ts
import { db } from './index';
import { sql } from 'drizzle-orm';

// Prepared statements for frequently used queries
export const preparedQueries = {
  getExecutionsByStatus: db.select()
    .from(executions)
    .where(eq(executions.status, placeholder('status')))
    .prepare(),

  getCurrentMonthCost: db.select({
    total: sum(costTracking.totalCostUsd)
  })
  .from(costTracking)
  .where(and(
    eq(costTracking.year, placeholder('year')),
    eq(costTracking.month, placeholder('month'))
  ))
  .prepare(),

  getRecentExecutions: db.select()
    .from(executions)
    .orderBy(desc(executions.startedAt))
    .limit(placeholder('limit'))
    .prepare(),
};

// Connection pooling for high-concurrency scenarios
export class ConnectionPool {
  private connections: Database.Database[] = [];
  private readonly maxConnections: number;
  private currentIndex: number = 0;

  constructor(dbPath: string, maxConnections: number = 5) {
    this.maxConnections = maxConnections;
    
    for (let i = 0; i < maxConnections; i++) {
      const connection = new Database(dbPath);
      this.configureConnection(connection);
      this.connections.push(connection);
    }
  }

  private configureConnection(connection: Database.Database): void {
    connection.pragma('journal_mode = WAL');
    connection.pragma('synchronous = NORMAL');
    connection.pragma('cache_size = 1000000');
    connection.pragma('temp_store = MEMORY');
    connection.pragma('foreign_keys = ON');
    connection.pragma('busy_timeout = 5000');
  }

  getConnection(): Database.Database {
    const connection = this.connections[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.maxConnections;
    return connection;
  }

  closeAll(): void {
    this.connections.forEach(conn => conn.close());
    this.connections = [];
  }
}
```

### Caching Strategy

**Query Result Caching**
```typescript
// src/lib/cache/queryCache.ts
import NodeCache from 'node-cache';

export class QueryCache {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300, // 5 minutes default
      checkperiod: 60, // Check for expired keys every minute
      maxKeys: 1000,
    });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set(key: string, value: any, ttl?: number): boolean {
    return this.cache.set(key, value, ttl);
  }

  del(key: string): number {
    return this.cache.del(key);
  }

  // Cache dashboard stats for 30 seconds
  async getDashboardStats(): Promise<DashboardStats> {
    const cacheKey = 'dashboard:stats';
    let stats = this.get<DashboardStats>(cacheKey);

    if (!stats) {
      stats = await getDashboardStats();
      this.set(cacheKey, stats, 30);
    }

    return stats;
  }

  // Cache monthly cost for 5 minutes
  async getCurrentMonthCost(): Promise<number> {
    const cacheKey = 'cost:current-month';
    let cost = this.get<number>(cacheKey);

    if (cost === undefined) {
      const result = await getCurrentMonthCost();
      cost = result.totalCost || 0;
      this.set(cacheKey, cost, 300);
    }

    return cost;
  }

  // Invalidate related caches when execution completes
  invalidateExecutionCaches(): void {
    const patterns = [
      'dashboard:*',
      'executions:*',
      'cost:*',
      'analytics:*'
    ];

    patterns.forEach(pattern => {
      const keys = this.cache.keys().filter(key => 
        key.match(pattern.replace('*', '.*'))
      );
      keys.forEach(key => this.cache.del(key));
    });
  }
}

export const queryCache = new QueryCache();
```

---

## Best Practices

### 1. Schema Design Principles

- **Use consistent naming conventions**: snake_case for database columns, camelCase for TypeScript
- **Implement proper indexing**: Index frequently queried columns and composite queries
- **Use appropriate data types**: Text for flexible JSON, specific types for known data
- **Include audit fields**: created_at, updated_at for all tables
- **Design for time-series data**: Separate tables for high-frequency metrics

### 2. Migration Management

- **Always use transactions**: Wrap schema changes in transactions
- **Test migrations thoroughly**: Use separate test database for migration testing
- **Keep migrations atomic**: One logical change per migration
- **Include rollback scripts**: Document how to reverse migrations
- **Use meaningful migration names**: Include timestamp and description

### 3. Query Optimization

- **Use prepared statements**: For frequently executed queries
- **Implement proper pagination**: Limit and offset for large result sets
- **Optimize JOIN operations**: Use appropriate indexes for join conditions
- **Cache expensive queries**: Cache dashboard and analytics queries
- **Monitor query performance**: Log slow queries in development

### 4. Error Handling

- **Use transactions for multi-table operations**: Ensure data consistency
- **Implement retry logic**: For handling temporary connection issues
- **Log database errors properly**: Include context and query information
- **Validate input data**: Use Drizzle's built-in validation features
- **Handle constraint violations**: Provide meaningful error messages

### 5. Security Considerations

- **Sanitize inputs**: Use parameterized queries (Drizzle handles this)
- **Encrypt sensitive data**: Hash API keys and sensitive configuration
- **Implement access controls**: Role-based access for different operations
- **Audit critical operations**: Log all schema changes and data modifications
- **Regular backups**: Automated daily backups with retention policy

---

## Implementation Roadmap

### Phase 1: Core Database Setup (Week 1-2)

**Week 1:**
- [ ] Set up basic Drizzle ORM configuration
- [ ] Implement core schema (executions, agents, costs)
- [ ] Create initial migration files
- [ ] Set up database connection and health checks
- [ ] Implement basic CRUD operations

**Week 2:**
- [ ] Add execution tracking service
- [ ] Implement cost recording functionality
- [ ] Create dashboard analytics queries
- [ ] Set up automated backup system
- [ ] Add error handling and logging

### Phase 2: Advanced Features (Week 3-4)

**Week 3:**
- [ ] Implement WebSocket integration for real-time updates
- [ ] Add query caching system
- [ ] Create migration management tools
- [ ] Implement connection pooling
- [ ] Add performance monitoring

**Week 4:**
- [ ] Build comprehensive analytics dashboard
- [ ] Add cost optimization features
- [ ] Implement scheduled execution tracking
- [ ] Create system health monitoring
- [ ] Add data export functionality

### Phase 3: Production Readiness (Week 5-6)

**Week 5:**
- [ ] Performance optimization and indexing
- [ ] Security hardening and audit logging
- [ ] Production configuration management
- [ ] Automated testing for database operations
- [ ] Documentation and deployment guides

**Week 6:**
- [ ] Load testing and performance tuning
- [ ] Backup and recovery testing
- [ ] Monitoring and alerting setup
- [ ] Final security review
- [ ] Production deployment preparation

### Phase 4: Future Enhancements (Month 2+)

- [ ] Multi-node support and distributed tracking
- [ ] Advanced analytics and forecasting
- [ ] Custom dashboard builders
- [ ] API rate limiting and throttling
- [ ] Integration with external monitoring systems

---

## Conclusion

This document provides a comprehensive guide for implementing SQLite with Drizzle ORM patterns specifically tailored for the ClaudeOps project. The patterns focus on:

1. **Type Safety**: Full TypeScript integration with Drizzle's type inference
2. **Performance**: Optimized schemas, indexes, and query patterns
3. **Scalability**: Connection pooling, caching, and efficient data structures
4. **Maintainability**: Clear separation of concerns and modular architecture
5. **Observability**: Comprehensive execution tracking and analytics

The implementation provides a robust foundation for tracking agent executions, managing costs, and monitoring system performance while maintaining the simplicity and efficiency that SQLite offers for the homelab use case.

By following these patterns and the implementation roadmap, the ClaudeOps project will have a production-ready database layer that can scale with the application's growth while providing excellent developer experience and operational reliability.