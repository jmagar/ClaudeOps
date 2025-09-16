const winston = require('winston');
import * as path from 'path';
import { ErrorCategory } from '../types/claude';

/**
 * Log levels with numeric priorities
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly'
}

/**
 * Log context for structured logging
 */
export interface LogContext {
  executionId?: string;
  agentType?: string;
  step?: string;
  userId?: string;
  requestId?: string;
  component?: string;
  operation?: string;
  duration?: number;
  cost?: number;
  metadata?: Record<string, any>;
  // Additional fields for extensibility
  [key: string]: any;
}

/**
 * Error context for error logging
 */
export interface ErrorLogContext extends LogContext {
  category?: ErrorCategory;
  retryable?: boolean;
  resolution?: string;
  stack?: string;
  error?: string;
  timestamp?: string;
  severity?: string;
  fingerprint?: string;
  tags?: string[];
  // Additional error fields
  [key: string]: any;
}

/**
 * Performance metrics context
 */
export interface PerformanceLogContext extends LogContext {
  startTime: number;
  endTime: number;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
}

/**
 * Audit log context for security and compliance
 */
export interface AuditLogContext extends LogContext {
  action: string;
  resource: string;
  outcome: 'success' | 'failure' | 'partial';
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  logDir: string;
  enableConsole: boolean;
  enableFileLogging: boolean;
  enableErrorFile: boolean;
  enableAuditFile: boolean;
  enablePerformanceFile: boolean;
  format: 'json' | 'simple' | 'combined';
  maxFileSize: string;
  maxFiles: number;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  logDir: path.join(process.cwd(), 'logs'),
  enableConsole: true,
  enableFileLogging: true,
  enableErrorFile: true,
  enableAuditFile: true,
  enablePerformanceFile: true,
  format: 'json',
  maxFileSize: '20MB',
  maxFiles: 5
};

/**
 * Custom log formats
 */
const logFormats = {
  json: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  simple: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.simple()
  ),
  combined: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `[${timestamp}] ${level}: ${message} ${metaStr}`;
    })
  )
};

/**
 * Structured logger implementation with Winston
 */
export class StructuredLogger {
  private logger: winston.Logger;
  private config: LoggerConfig;
  private static instance: StructuredLogger;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = this.createLogger();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<LoggerConfig>): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger(config);
    }
    return StructuredLogger.instance;
  }

  /**
   * Create Winston logger with configured transports
   */
  private createLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const context = this.formatContext(meta);
              return `[${timestamp}] ${level}: ${message}${context}`;
            })
          )
        })
      );
    }

    // Main log file transport
    if (this.config.enableFileLogging) {
      transports.push(
        new winston.transports.File({
          filename: path.join(this.config.logDir, 'claudeops.log'),
          maxsize: this.parseMaxSize(this.config.maxFileSize),
          maxFiles: this.config.maxFiles,
          tailable: true,
          format: logFormats[this.config.format]
        })
      );
    }

    // Error-specific log file
    if (this.config.enableErrorFile) {
      transports.push(
        new winston.transports.File({
          level: 'error',
          filename: path.join(this.config.logDir, 'errors.log'),
          maxsize: this.parseMaxSize(this.config.maxFileSize),
          maxFiles: this.config.maxFiles,
          tailable: true,
          format: logFormats[this.config.format]
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      format: logFormats[this.config.format],
      transports,
      exitOnError: false
    });
  }

  /**
   * Parse max size string to bytes
   */
  private parseMaxSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+)(MB|KB|GB)?$/i);
    if (!match) return 20 * 1024 * 1024; // Default 20MB

    const size = parseInt(match[1]);
    const unit = (match[2] || 'MB').toUpperCase();

    switch (unit) {
      case 'KB': return size * 1024;
      case 'GB': return size * 1024 * 1024 * 1024;
      case 'MB':
      default: return size * 1024 * 1024;
    }
  }

  /**
   * Format context for console output
   */
  private formatContext(meta: any): string {
    const filteredMeta = { ...meta };
    delete filteredMeta.timestamp;
    delete filteredMeta.level;
    delete filteredMeta.message;

    if (Object.keys(filteredMeta).length === 0) {
      return '';
    }

    const contextItems = [];
    if (filteredMeta.executionId) contextItems.push(`exec:${filteredMeta.executionId.slice(-8)}`);
    if (filteredMeta.agentType) contextItems.push(`agent:${filteredMeta.agentType}`);
    if (filteredMeta.component) contextItems.push(`comp:${filteredMeta.component}`);
    if (filteredMeta.operation) contextItems.push(`op:${filteredMeta.operation}`);

    const contextStr = contextItems.length > 0 ? ` [${contextItems.join(', ')}]` : '';
    const remaining = Object.keys(filteredMeta).filter(
      key => !['executionId', 'agentType', 'component', 'operation'].includes(key)
    );

    if (remaining.length > 0) {
      const remainingObj = remaining.reduce((obj, key) => {
        obj[key] = filteredMeta[key];
        return obj;
      }, {} as Record<string, any>);
      return `${contextStr} ${JSON.stringify(remainingObj)}`;
    }

    return contextStr;
  }

  /**
   * Log general information
   */
  info(message: string, context?: LogContext): void {
    this.logger.info(message, { ...context, timestamp: new Date().toISOString() });
  }

  /**
   * Log warnings
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, { ...context, timestamp: new Date().toISOString() });
  }

  /**
   * Log errors with enhanced context
   */
  error(message: string, error?: Error, context?: ErrorLogContext): void {
    const errorContext: ErrorLogContext = {
      ...context,
      timestamp: new Date().toISOString(),
      stack: error?.stack,
      error: error?.message
    };

    this.logger.error(message, errorContext);
  }

  /**
   * Log debug information
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, { ...context, timestamp: new Date().toISOString() });
  }

  /**
   * Log HTTP requests
   */
  http(message: string, context?: LogContext & { method?: string; url?: string; statusCode?: number; responseTime?: number }): void {
    this.logger.http(message, { ...context, timestamp: new Date().toISOString() });
  }

  /**
   * Log performance metrics
   */
  performance(message: string, context: PerformanceLogContext): void {
    const duration = context.endTime - context.startTime;
    const performanceContext = {
      ...context,
      duration,
      timestamp: new Date().toISOString()
    };

    this.logger.info(message, performanceContext);
  }

  /**
   * Log audit events for security and compliance
   */
  audit(message: string, context: AuditLogContext): void {
    const auditContext = {
      ...context,
      timestamp: new Date().toISOString(),
      level: 'audit'
    };

    this.logger.info(message, auditContext);
  }

  /**
   * Log agent execution events
   */
  execution(message: string, context: LogContext & { 
    status?: 'started' | 'completed' | 'failed' | 'cancelled';
    stepNumber?: number;
    stepName?: string;
    output?: any;
  }): void {
    this.logger.info(message, { 
      ...context, 
      timestamp: new Date().toISOString(),
      component: 'execution'
    });
  }

  /**
   * Log cost tracking events
   */
  cost(message: string, context: LogContext & { 
    cost: number;
    tokens?: {
      input: number;
      output: number;
      cache?: number;
    };
    model?: string;
  }): void {
    this.logger.info(message, { 
      ...context, 
      timestamp: new Date().toISOString(),
      component: 'cost-tracking'
    });
  }

  /**
   * Log WebSocket events
   */
  websocket(message: string, context: LogContext & { 
    event?: string;
    connectionId?: string;
    clientCount?: number;
  }): void {
    this.logger.debug(message, { 
      ...context, 
      timestamp: new Date().toISOString(),
      component: 'websocket'
    });
  }

  /**
   * Log database operations
   */
  database(message: string, context: LogContext & { 
    query?: string;
    duration?: number;
    affectedRows?: number;
  }): void {
    this.logger.debug(message, { 
      ...context, 
      timestamp: new Date().toISOString(),
      component: 'database'
    });
  }

  /**
   * Create a child logger with persistent context
   */
  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.logger.level as LogLevel;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }
}

/**
 * Child logger that maintains persistent context
 */
export class ChildLogger {
  constructor(
    private parent: StructuredLogger,
    private persistentContext: LogContext
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.persistentContext, ...context };
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, error?: Error, context?: ErrorLogContext): void {
    this.parent.error(message, error, this.mergeContext(context));
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  execution(message: string, context: LogContext & { 
    status?: 'started' | 'completed' | 'failed' | 'cancelled';
    stepNumber?: number;
    stepName?: string;
    output?: any;
  }): void {
    this.parent.execution(message, this.mergeContext(context));
  }

  cost(message: string, context: LogContext & { 
    cost: number;
    tokens?: {
      input: number;
      output: number;
      cache?: number;
    };
    model?: string;
  }): void {
    this.parent.cost(message, { ...this.persistentContext, ...context });
  }

  websocket(message: string, context: LogContext & { 
    event?: string;
    connectionId?: string;
    clientCount?: number;
  }): void {
    this.parent.websocket(message, this.mergeContext(context));
  }

  database(message: string, context: LogContext & { 
    query?: string;
    duration?: number;
    affectedRows?: number;
  }): void {
    this.parent.database(message, this.mergeContext(context));
  }

  child(context: LogContext): ChildLogger {
    return new ChildLogger(this.parent, this.mergeContext(context));
  }
}

// Default logger instance
export const logger = StructuredLogger.getInstance();

// Export convenience functions
export const log = {
  info: (message: string, context?: LogContext) => logger.info(message, context),
  warn: (message: string, context?: LogContext) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: ErrorLogContext) => logger.error(message, error, context),
  debug: (message: string, context?: LogContext) => logger.debug(message, context),
  http: (message: string, context?: LogContext & { method?: string; url?: string; statusCode?: number; responseTime?: number }) => logger.http(message, context),
  performance: (message: string, context: PerformanceLogContext) => logger.performance(message, context),
  audit: (message: string, context: AuditLogContext) => logger.audit(message, context),
  execution: (message: string, context: LogContext & { 
    status?: 'started' | 'completed' | 'failed' | 'cancelled';
    stepNumber?: number;
    stepName?: string;
    output?: any;
  }) => logger.execution(message, context),
  cost: (message: string, context: LogContext & { 
    cost: number;
    tokens?: {
      input: number;
      output: number;
      cache?: number;
    };
    model?: string;
  }) => logger.cost(message, context),
  websocket: (message: string, context: LogContext & { 
    event?: string;
    connectionId?: string;
    clientCount?: number;
  }) => logger.websocket(message, context),
  database: (message: string, context: LogContext & { 
    query?: string;
    duration?: number;
    affectedRows?: number;
  }) => logger.database(message, context),
  child: (context: LogContext) => logger.child(context)
};