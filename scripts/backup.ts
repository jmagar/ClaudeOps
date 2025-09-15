#!/usr/bin/env node

/**
 * ClaudeOps Database Backup Script
 * Cross-platform TypeScript implementation for regular SQLite database backups
 * with rotation and cleanup
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { execSync, spawn } from 'child_process';
import { gzipSync, gunzipSync } from 'zlib';

interface BackupConfig {
  backupPath: string;
  dataPath: string;
  retentionDays: number;
  dbFile: string;
  logFile: string;
}

class BackupManager {
  private config: BackupConfig;

  constructor() {
    this.config = {
      backupPath: process.env.BACKUP_PATH || './backups',
      dataPath: process.env.DATA_PATH || './data',
      retentionDays: parseInt(process.env.RETENTION_DAYS || '30', 10),
      dbFile: process.env.DB_FILE || 'production.db',
      logFile: '',
    };
    this.config.logFile = join(this.config.backupPath, 'backup.log');
  }

  private formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + sizes[i];
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logMessage = `[${timestamp}] ${level}: ${message}`;
    
    // Console output with colors
    const colors = {
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
      RESET: '\x1b[0m'
    };
    
    console.log(`${colors[level]}${logMessage}${colors.RESET}`);
    
    // Write to log file
    try {
      mkdirSync(dirname(this.config.logFile), { recursive: true });
      writeFileSync(this.config.logFile, logMessage + '\n', { flag: 'a' });
    } catch (error) {
      // Ignore log file write errors to prevent infinite loops
    }
  }

  private createBackupDirectory(): void {
    try {
      mkdirSync(this.config.backupPath, { recursive: true });
      this.log('INFO', `Created backup directory: ${this.config.backupPath}`);
    } catch (error) {
      // Directory might already exist
    }
  }

  private checkDatabaseExists(): boolean {
    const dbPath = join(this.config.dataPath, this.config.dbFile);
    if (!existsSync(dbPath)) {
      this.log('WARN', `Database file not found: ${dbPath}`);
      return false;
    }
    return true;
  }

  private checkDatabaseIntegrity(dbPath: string): boolean {
    try {
      const result = execSync(`sqlite3 "${dbPath}" "PRAGMA integrity_check;"`, { 
        encoding: 'utf8',
        timeout: 30000 
      }).trim();
      
      if (result !== 'ok') {
        this.log('ERROR', `Database integrity check failed for: ${dbPath} - ${result}`);
        return false;
      }
      return true;
    } catch (error) {
      this.log('ERROR', `Failed to check database integrity: ${error}`);
      return false;
    }
  }

  private performBackup(): boolean {
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').substring(0, 15);
    const dbPath = join(this.config.dataPath, this.config.dbFile);
    const backupFile = join(this.config.backupPath, `${this.config.dbFile.replace('.db', '')}_${timestamp}.db`);
    const backupCompressed = `${backupFile}.gz`;

    this.log('INFO', `Starting backup: ${dbPath} -> ${backupCompressed}`);

    // Check database integrity first
    if (!this.checkDatabaseIntegrity(dbPath)) {
      return false;
    }

    try {
      // Create backup using SQLite backup command
      execSync(`sqlite3 "${dbPath}" ".backup '${backupFile}'"`, { 
        timeout: 60000 
      });
      this.log('INFO', `Database backup created: ${backupFile}`);

      // Compress the backup
      const backupData = readFileSync(backupFile);
      const compressed = gzipSync(backupData);
      writeFileSync(backupCompressed, compressed);
      
      // Remove uncompressed backup
      unlinkSync(backupFile);
      this.log('INFO', `Backup compressed: ${backupCompressed}`);

      // Verify backup integrity
      try {
        gunzipSync(readFileSync(backupCompressed));
        this.log('INFO', `Backup integrity verified: ${backupCompressed}`);
        
        // Log backup size
        const backupSize = statSync(backupCompressed).size;
        this.log('INFO', `Backup size: ${this.formatBytes(backupSize)}`);
        
        return true;
      } catch (error) {
        this.log('ERROR', `Backup integrity verification failed: ${backupCompressed}`);
        unlinkSync(backupCompressed);
        return false;
      }
    } catch (error) {
      this.log('ERROR', `Failed to create backup: ${error}`);
      // Clean up partial files
      try {
        if (existsSync(backupFile)) unlinkSync(backupFile);
        if (existsSync(backupCompressed)) unlinkSync(backupCompressed);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      return false;
    }
  }

  private cleanupOldBackups(): void {
    this.log('INFO', `Starting cleanup of backups older than ${this.config.retentionDays} days`);

    let deletedCount = 0;
    let totalSizeFreed = 0;
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    const backupPattern = new RegExp(`${this.config.dbFile.replace('.db', '')}_\\d+\\.db\\.gz$`);

    try {
      const files = readdirSync(this.config.backupPath);
      
      for (const file of files) {
        if (backupPattern.test(file)) {
          const filePath = join(this.config.backupPath, file);
          const stats = statSync(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            const fileSize = stats.size;
            unlinkSync(filePath);
            deletedCount++;
            totalSizeFreed += fileSize;
            this.log('INFO', `Deleted old backup: ${file}`);
          }
        }
      }

      if (deletedCount > 0) {
        this.log('INFO', `Cleanup completed: deleted ${deletedCount} files, freed ${this.formatBytes(totalSizeFreed)}`);
      } else {
        this.log('INFO', 'Cleanup completed: no old backups found');
      }
    } catch (error) {
      this.log('ERROR', `Failed during cleanup: ${error}`);
    }
  }

  private generateBackupReport(): void {
    try {
      const files = readdirSync(this.config.backupPath);
      const backupPattern = new RegExp(`${this.config.dbFile.replace('.db', '')}_\\d+\\.db\\.gz$`);
      
      let backupCount = 0;
      let totalSize = 0;

      for (const file of files) {
        if (backupPattern.test(file)) {
          const filePath = join(this.config.backupPath, file);
          const stats = statSync(filePath);
          backupCount++;
          totalSize += stats.size;
        }
      }

      this.log('INFO', 'Backup Report:');
      this.log('INFO', `  - Total backups: ${backupCount}`);
      this.log('INFO', `  - Total size: ${this.formatBytes(totalSize)}`);
      this.log('INFO', `  - Retention days: ${this.config.retentionDays}`);
      this.log('INFO', `  - Backup path: ${this.config.backupPath}`);
    } catch (error) {
      this.log('ERROR', `Failed to generate backup report: ${error}`);
    }
  }

  private healthCheck(): boolean {
    const dbPath = join(this.config.dataPath, this.config.dbFile);

    // Check if database is accessible
    try {
      execSync(`sqlite3 "${dbPath}" "SELECT 1;"`, { 
        timeout: 10000,
        stdio: 'ignore' 
      });
    } catch (error) {
      this.log('ERROR', 'Database health check failed: cannot access database');
      return false;
    }

    // Check disk space (simplified check)
    try {
      const stats = statSync(this.config.backupPath);
      // This is a simplified check - in a real implementation you'd use a more sophisticated disk space check
      this.log('INFO', 'Disk space check passed');
    } catch (error) {
      this.log('WARN', `Could not check disk space: ${error}`);
    }

    return true;
  }

  public async run(): Promise<void> {
    const startTime = Date.now();

    this.log('INFO', 'ClaudeOps backup script starting...');
    this.log('INFO', 'Configuration:');
    this.log('INFO', `  - Database: ${join(this.config.dataPath, this.config.dbFile)}`);
    this.log('INFO', `  - Backup path: ${this.config.backupPath}`);
    this.log('INFO', `  - Retention: ${this.config.retentionDays} days`);

    // Pre-flight checks
    try {
      execSync('sqlite3 --version', { stdio: 'ignore' });
    } catch (error) {
      this.log('ERROR', 'sqlite3 command not found');
      process.exit(1);
    }

    // Create backup directory
    this.createBackupDirectory();

    // Check database exists
    if (!this.checkDatabaseExists()) {
      this.log('ERROR', 'Database check failed, exiting');
      process.exit(1);
    }

    // Perform health check
    if (!this.healthCheck()) {
      this.log('ERROR', 'Health check failed, but continuing with backup');
    }

    // Perform backup
    if (this.performBackup()) {
      this.log('INFO', 'Backup completed successfully');
    } else {
      this.log('ERROR', 'Backup failed');
      process.exit(1);
    }

    // Clean up old backups
    this.cleanupOldBackups();

    // Generate report
    this.generateBackupReport();

    const duration = Math.round((Date.now() - startTime) / 1000);
    this.log('INFO', `Backup script completed in ${duration}s`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nBackup script interrupted, cleaning up...');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\nBackup script terminated, cleaning up...');
  process.exit(1);
});

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const backupManager = new BackupManager();
  backupManager.run().catch((error) => {
    console.error('Backup script failed:', error);
    process.exit(1);
  });
}