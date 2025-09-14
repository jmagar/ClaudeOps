import * as fs from 'fs/promises';
import * as path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { logger } from './logger';

/**
 * Log rotation configuration
 */
export interface LogRotationConfig {
  logDirectory: string;
  maxFileSize: number; // in bytes
  maxFiles: number;
  maxAge: number; // in days
  compressionEnabled: boolean;
  rotationSchedule: 'hourly' | 'daily' | 'weekly' | 'monthly';
  preserveOriginal: boolean;
}

/**
 * Log file information
 */
export interface LogFileInfo {
  path: string;
  name: string;
  size: number;
  created: Date;
  modified: Date;
  compressed: boolean;
  rotated: boolean;
}

/**
 * Rotation statistics
 */
export interface RotationStats {
  filesRotated: number;
  filesCompressed: number;
  filesDeleted: number;
  spaceSaved: number;
  lastRotation: Date;
  nextScheduledRotation?: Date;
}

/**
 * Log rotation manager
 */
export class LogRotationManager {
  private config: LogRotationConfig;
  private rotationTimer?: NodeJS.Timeout;
  private stats: RotationStats;

  constructor(config: Partial<LogRotationConfig> = {}) {
    this.config = {
      logDirectory: path.join(process.cwd(), 'logs'),
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      maxAge: 30, // 30 days
      compressionEnabled: true,
      rotationSchedule: 'daily',
      preserveOriginal: false,
      ...config
    };

    this.stats = {
      filesRotated: 0,
      filesCompressed: 0,
      filesDeleted: 0,
      spaceSaved: 0,
      lastRotation: new Date()
    };

    this.startScheduledRotation();
  }

  /**
   * Start scheduled rotation based on configuration
   */
  startScheduledRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    const interval = this.getRotationInterval();
    this.rotationTimer = setInterval(() => {
      this.performScheduledRotation().catch(error => {
        logger.error('Scheduled rotation failed', error, {
          component: 'log-rotation',
          operation: 'scheduled-rotation'
        });
      });
    }, interval);

    logger.info('Log rotation scheduler started', {
      component: 'log-rotation',
      schedule: this.config.rotationSchedule,
      intervalMs: interval
    });
  }

  /**
   * Stop scheduled rotation
   */
  stopScheduledRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
    }

    logger.info('Log rotation scheduler stopped', {
      component: 'log-rotation'
    });
  }

  /**
   * Get rotation interval in milliseconds
   */
  private getRotationInterval(): number {
    switch (this.config.rotationSchedule) {
      case 'hourly':
        return 60 * 60 * 1000; // 1 hour
      case 'daily':
        return 24 * 60 * 60 * 1000; // 24 hours
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000; // 7 days
      case 'monthly':
        return 30 * 24 * 60 * 60 * 1000; // 30 days
      default:
        return 24 * 60 * 60 * 1000; // Default to daily
    }
  }

  /**
   * Perform scheduled rotation
   */
  async performScheduledRotation(): Promise<void> {
    logger.info('Starting scheduled log rotation', {
      component: 'log-rotation',
      operation: 'scheduled-rotation'
    });

    try {
      await this.rotateAllLogs();
      await this.compressOldLogs();
      await this.cleanupOldLogs();

      this.stats.lastRotation = new Date();
      
      logger.info('Scheduled log rotation completed', {
        component: 'log-rotation',
        operation: 'scheduled-rotation',
        stats: this.stats
      });
    } catch (error) {
      logger.error('Scheduled rotation failed', error as Error, {
        component: 'log-rotation',
        operation: 'scheduled-rotation'
      });
      throw error;
    }
  }

  /**
   * Rotate all logs in the directory
   */
  async rotateAllLogs(): Promise<void> {
    const logFiles = await this.getLogFiles();
    const filesToRotate = logFiles.filter(file => this.shouldRotateFile(file));

    for (const file of filesToRotate) {
      await this.rotateFile(file);
      this.stats.filesRotated++;
    }

    if (filesToRotate.length > 0) {
      logger.info('Log files rotated', {
        component: 'log-rotation',
        operation: 'rotate-files',
        count: filesToRotate.length,
        files: filesToRotate.map(f => f.name)
      });
    }
  }

  /**
   * Get all log files in the directory
   */
  async getLogFiles(): Promise<LogFileInfo[]> {
    try {
      await fs.access(this.config.logDirectory);
    } catch {
      // Create directory if it doesn't exist
      await fs.mkdir(this.config.logDirectory, { recursive: true });
      return [];
    }

    const files = await fs.readdir(this.config.logDirectory);
    const logFiles: LogFileInfo[] = [];

    for (const filename of files) {
      if (!this.isLogFile(filename)) {
        continue;
      }

      const filePath = path.join(this.config.logDirectory, filename);
      try {
        const stats = await fs.stat(filePath);
        
        logFiles.push({
          path: filePath,
          name: filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          compressed: filename.endsWith('.gz'),
          rotated: this.isRotatedLogFile(filename)
        });
      } catch (error) {
        logger.warn('Failed to get stats for log file', {
          component: 'log-rotation',
          filename,
          error: (error as Error).message
        });
      }
    }

    return logFiles;
  }

  /**
   * Check if a file is a log file
   */
  private isLogFile(filename: string): boolean {
    return filename.endsWith('.log') || filename.endsWith('.log.gz');
  }

  /**
   * Check if a file is a rotated log file
   */
  private isRotatedLogFile(filename: string): boolean {
    const rotationPattern = /\.\d{4}-\d{2}-\d{2}(-\d{2})?\.log(\.gz)?$/;
    return rotationPattern.test(filename);
  }

  /**
   * Check if a file should be rotated
   */
  shouldRotateFile(file: LogFileInfo): boolean {
    // Don't rotate already rotated files
    if (file.rotated) {
      return false;
    }

    // Don't rotate compressed files
    if (file.compressed) {
      return false;
    }

    // Check file size
    if (file.size >= this.config.maxFileSize) {
      return true;
    }

    // Check file age based on schedule
    const now = new Date();
    const fileAge = now.getTime() - file.modified.getTime();
    const rotationInterval = this.getRotationInterval();

    return fileAge >= rotationInterval;
  }

  /**
   * Rotate a single log file
   */
  async rotateFile(file: LogFileInfo): Promise<void> {
    const timestamp = this.getTimestamp();
    const extension = file.compressed ? '.log.gz' : '.log';
    const baseName = file.name.replace(/\.log(\.gz)?$/, '');
    const rotatedName = `${baseName}.${timestamp}${extension}`;
    const rotatedPath = path.join(this.config.logDirectory, rotatedName);

    try {
      // Move the file to rotated name
      await fs.rename(file.path, rotatedPath);

      logger.debug('Log file rotated', {
        component: 'log-rotation',
        operation: 'rotate-file',
        originalFile: file.name,
        rotatedFile: rotatedName,
        size: file.size
      });

      // Create new empty log file if needed
      if (!this.config.preserveOriginal) {
        await fs.writeFile(file.path, '', 'utf8');
      }
    } catch (error) {
      logger.error('Failed to rotate log file', error as Error, {
        component: 'log-rotation',
        operation: 'rotate-file',
        filename: file.name
      });
      throw error;
    }
  }

  /**
   * Compress old log files
   */
  async compressOldLogs(): Promise<void> {
    if (!this.config.compressionEnabled) {
      return;
    }

    const logFiles = await this.getLogFiles();
    const filesToCompress = logFiles.filter(file => 
      file.rotated && !file.compressed && file.name.endsWith('.log')
    );

    for (const file of filesToCompress) {
      await this.compressFile(file);
      this.stats.filesCompressed++;
    }

    if (filesToCompress.length > 0) {
      logger.info('Log files compressed', {
        component: 'log-rotation',
        operation: 'compress-files',
        count: filesToCompress.length
      });
    }
  }

  /**
   * Compress a single log file
   */
  async compressFile(file: LogFileInfo): Promise<void> {
    const compressedPath = `${file.path}.gz`;

    try {
      const gzipStream = createGzip({ level: 9 });
      const sourceStream = createReadStream(file.path);
      const destStream = createWriteStream(compressedPath);

      await pipeline(sourceStream, gzipStream, destStream);

      // Get compressed file size for statistics
      const compressedStats = await fs.stat(compressedPath);
      const spaceSaved = file.size - compressedStats.size;
      this.stats.spaceSaved += spaceSaved;

      // Remove original file
      await fs.unlink(file.path);

      logger.debug('Log file compressed', {
        component: 'log-rotation',
        operation: 'compress-file',
        filename: file.name,
        originalSize: file.size,
        compressedSize: compressedStats.size,
        spaceSaved
      });
    } catch (error) {
      logger.error('Failed to compress log file', error as Error, {
        component: 'log-rotation',
        operation: 'compress-file',
        filename: file.name
      });

      // Clean up partial compressed file if it exists
      try {
        await fs.unlink(compressedPath);
      } catch {
        // Ignore cleanup errors
      }

      throw error;
    }
  }

  /**
   * Clean up old log files based on retention policy
   */
  async cleanupOldLogs(): Promise<void> {
    const logFiles = await this.getLogFiles();
    const now = new Date();
    const maxAgeMs = this.config.maxAge * 24 * 60 * 60 * 1000;

    // Find files to delete based on age
    const filesToDeleteByAge = logFiles.filter(file => {
      const fileAge = now.getTime() - file.created.getTime();
      return fileAge > maxAgeMs && file.rotated;
    });

    // Find files to delete based on count (keep only maxFiles)
    const rotatedFiles = logFiles
      .filter(file => file.rotated)
      .sort((a, b) => b.created.getTime() - a.created.getTime());

    const filesToDeleteByCount = rotatedFiles.slice(this.config.maxFiles);

    // Combine and deduplicate files to delete
    const filesToDelete = Array.from(new Set([
      ...filesToDeleteByAge,
      ...filesToDeleteByCount
    ]));

    for (const file of filesToDelete) {
      await this.deleteFile(file);
      this.stats.filesDeleted++;
    }

    if (filesToDelete.length > 0) {
      logger.info('Old log files cleaned up', {
        component: 'log-rotation',
        operation: 'cleanup-files',
        count: filesToDelete.length,
        reason: 'retention-policy'
      });
    }
  }

  /**
   * Delete a log file
   */
  async deleteFile(file: LogFileInfo): Promise<void> {
    try {
      await fs.unlink(file.path);
      
      logger.debug('Log file deleted', {
        component: 'log-rotation',
        operation: 'delete-file',
        filename: file.name,
        size: file.size
      });
    } catch (error) {
      logger.error('Failed to delete log file', error as Error, {
        component: 'log-rotation',
        operation: 'delete-file',
        filename: file.name
      });
      throw error;
    }
  }

  /**
   * Generate timestamp for rotated files
   */
  private getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    switch (this.config.rotationSchedule) {
      case 'hourly':
        const hour = String(now.getHours()).padStart(2, '0');
        return `${year}-${month}-${day}-${hour}`;
      case 'daily':
        return `${year}-${month}-${day}`;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekYear = weekStart.getFullYear();
        const weekMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
        const weekDay = String(weekStart.getDate()).padStart(2, '0');
        return `${weekYear}-${weekMonth}-${weekDay}-week`;
      case 'monthly':
        return `${year}-${month}`;
      default:
        return `${year}-${month}-${day}`;
    }
  }

  /**
   * Force rotation of all eligible files
   */
  async forceRotation(): Promise<void> {
    logger.info('Starting forced log rotation', {
      component: 'log-rotation',
      operation: 'force-rotation'
    });

    await this.performScheduledRotation();

    logger.info('Forced log rotation completed', {
      component: 'log-rotation',
      operation: 'force-rotation'
    });
  }

  /**
   * Get rotation statistics
   */
  getStatistics(): RotationStats {
    return {
      ...this.stats,
      nextScheduledRotation: new Date(
        this.stats.lastRotation.getTime() + this.getRotationInterval()
      )
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      filesRotated: 0,
      filesCompressed: 0,
      filesDeleted: 0,
      spaceSaved: 0,
      lastRotation: new Date()
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LogRotationConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart scheduler if schedule changed
    if (config.rotationSchedule) {
      this.startScheduledRotation();
    }

    logger.info('Log rotation configuration updated', {
      component: 'log-rotation',
      config: this.config
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): LogRotationConfig {
    return { ...this.config };
  }

  /**
   * Health check for rotation system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check if log directory is accessible
      await fs.access(this.config.logDirectory);
    } catch {
      issues.push('Log directory is not accessible');
      recommendations.push('Check log directory permissions and path');
    }

    // Check disk space (if possible)
    try {
      const logFiles = await this.getLogFiles();
      const totalSize = logFiles.reduce((sum, file) => sum + file.size, 0);
      
      if (totalSize > 500 * 1024 * 1024) { // 500MB
        issues.push(`Log files are consuming ${Math.round(totalSize / 1024 / 1024)}MB of disk space`);
        recommendations.push('Consider reducing retention period or increasing rotation frequency');
      }

      // Check for files that should have been rotated
      const overdueFiles = logFiles.filter(file => 
        !file.rotated && file.size > this.config.maxFileSize * 1.5
      );
      
      if (overdueFiles.length > 0) {
        issues.push(`${overdueFiles.length} log files are overdue for rotation`);
        recommendations.push('Run manual rotation or check rotation scheduler');
      }
    } catch (error) {
      issues.push('Failed to analyze log files');
      recommendations.push('Check log directory permissions');
    }

    const status = issues.length === 0 ? 'healthy' : 
                  issues.length <= 2 ? 'warning' : 'error';

    return { status, issues, recommendations };
  }

  /**
   * Cleanup and destroy the rotation manager
   */
  destroy(): void {
    this.stopScheduledRotation();
    logger.info('Log rotation manager destroyed', {
      component: 'log-rotation'
    });
  }
}

// Default log rotation manager instance
export const logRotationManager = new LogRotationManager();