import { db, sqlite } from '../connection';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as path from 'path';
import * as fs from 'fs';

export interface MigrationResult {
  success: boolean;
  appliedMigrations: number;
  error?: string;
  duration?: number;
}

export async function runMigrations(): Promise<MigrationResult> {
  const startTime = Date.now();
  
  try {
    const migrationsPath = path.join(process.cwd(), 'drizzle');
    
    // Ensure migrations directory exists
    if (!fs.existsSync(migrationsPath)) {
      return {
        success: false,
        appliedMigrations: 0,
        error: 'Migrations directory not found. Run `npm run db:generate` first.',
        duration: Date.now() - startTime,
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
      appliedMigrations: migrationFiles,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      appliedMigrations: 0,
      error: error instanceof Error ? error.message : 'Unknown migration error',
      duration: Date.now() - startTime,
    };
  }
}

// Initialize database and run migrations
export async function initializeDatabase(): Promise<MigrationResult> {
  try {
    console.log('🔄 Initializing database...');
    
    const result = await runMigrations();
    
    if (result.success) {
      console.log(`✅ Database initialized successfully`);
      console.log(`   Applied ${result.appliedMigrations} migrations in ${result.duration}ms`);
    } else {
      console.error(`❌ Database initialization failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    const result: MigrationResult = {
      success: false,
      appliedMigrations: 0,
      error: error instanceof Error ? error.message : 'Unknown initialization error'
    };
    
    console.error(`❌ Database initialization failed: ${result.error}`);
    return result;
  }
}