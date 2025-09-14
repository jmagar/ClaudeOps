import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import * as path from 'path';
import * as fs from 'fs';

// Database configuration interface
interface DatabaseConfig {
  path: string;
  backupPath?: string;
  maxConnections: number;
  busyTimeout: number;
  journalMode: 'WAL' | 'DELETE' | 'TRUNCATE';
  synchronous: 'OFF' | 'NORMAL' | 'FULL';
  cacheSize: number;
}

// Get database configuration based on environment
function getDatabaseConfig(): DatabaseConfig {
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

// Singleton database connection class
class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: ReturnType<typeof drizzle>;
  private sqlite: Database.Database;
  private config: DatabaseConfig;

  private constructor() {
    this.config = getDatabaseConfig();
    this.ensureDataDirectory();
    this.sqlite = new Database(this.config.path);
    this.configureSQLite();
    this.db = drizzle(this.sqlite, { 
      schema,
      logger: process.env.NODE_ENV === 'development'
    });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private ensureDataDirectory(): void {
    if (this.config.path === ':memory:') return;
    
    const dataDir = path.dirname(this.config.path);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create backup directory if specified
    if (this.config.backupPath && !fs.existsSync(this.config.backupPath)) {
      fs.mkdirSync(this.config.backupPath, { recursive: true });
    }
  }

  private configureSQLite(): void {
    // WAL mode for better concurrency
    this.sqlite.pragma(`journal_mode = ${this.config.journalMode}`);
    
    // Optimize for performance
    this.sqlite.pragma(`synchronous = ${this.config.synchronous}`);
    this.sqlite.pragma(`cache_size = ${this.config.cacheSize}`);
    this.sqlite.pragma('temp_store = MEMORY');
    
    // Enable foreign keys
    this.sqlite.pragma('foreign_keys = ON');
    
    // Set busy timeout for concurrent access
    this.sqlite.pragma(`busy_timeout = ${this.config.busyTimeout}`);
  }

  public getDb() {
    return this.db;
  }

  public getSQLite() {
    return this.sqlite;
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

  public getConfig(): DatabaseConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const dbConnection = DatabaseConnection.getInstance();
export const db = dbConnection.getDb();
export const sqlite = dbConnection.getSQLite();

// Export utility functions
export function isDatabaseHealthy(): boolean {
  return dbConnection.healthCheck();
}

export function closeDatabase(): void {
  dbConnection.close();
}

export function getDatabasePath(): string {
  return dbConnection.getConfig().path;
}