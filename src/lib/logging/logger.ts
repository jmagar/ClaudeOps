import winston from 'winston';
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
 * Log rotation configuration
 */
export interface LogRotationConfig {
  maxSize: string;
  maxFiles: string | number;
  datePattern?: string;
  zippedArchive: boolean;
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
  rotation: LogRotationConfig;
  format: 'json' | 'simple' | 'combined';
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
  rotation: {
    maxSize: '20MB',
    maxFiles: '14d',
    datePattern: 'YYYY-MM-DD-HH',
    zippedArchive: true
  },
  format: 'json'
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
        new winston.transports.DailyRotateFile({
          filename: path.join(this.config.logDir, 'claudeops-%DATE%.log'),
          datePattern: this.config.rotation.datePattern,
          zippedArchive: this.config.rotation.zippedArchive,
          maxSize: this.config.rotation.maxSize,
          maxFiles: this.config.rotation.maxFiles,
          format: logFormats[this.config.format]
        })
      );
    }

    // Error-specific log file
    if (this.config.enableErrorFile) {
      transports.push(
        new winston.transports.DailyRotateFile({
          level: 'error',
          filename: path.join(this.config.logDir, 'errors-%DATE%.log'),
          datePattern: this.config.rotation.datePattern,
          zippedArchive: this.config.rotation.zippedArchive,
          maxSize: this.config.rotation.maxSize,
          maxFiles: this.config.rotation.maxFiles,
          format: logFormats[this.config.format]
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      format: logFormats[this.config.format],
      transports,
      exitOnError: false,
      handleExceptions: true,
      handleRejections: true
    });
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

    // Log to separate performance file if enabled
    if (this.config.enablePerformanceFile) {
      const performanceLogger = winston.createLogger({
        transports: [
          new winston.transports.DailyRotateFile({
            filename: path.join(this.config.logDir, 'performance-%DATE%.log'),
            datePattern: this.config.rotation.datePattern,
            zippedArchive: this.config.rotation.zippedArchive,
            maxSize: this.config.rotation.maxSize,
            maxFiles: this.config.rotation.maxFiles,
            format: logFormats[this.config.format]
          })
        ]
      });
      performanceLogger.info(message, performanceContext);
    } else {
      this.logger.info(message, performanceContext);
    }
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

    // Log to separate audit file if enabled
    if (this.config.enableAuditFile) {
      const auditLogger = winston.createLogger({
        transports: [
          new winston.transports.DailyRotateFile({
            filename: path.join(this.config.logDir, 'audit-%DATE%.log'),
            datePattern: this.config.rotation.datePattern,
            zippedArchive: this.config.rotation.zippedArchive,
            maxSize: this.config.rotation.maxSize,
            maxFiles: this.config.rotation.maxFiles,
            format: logFormats[this.config.format]
          })
        ]
      });
      auditLogger.info(message, auditContext);
    } else {
      this.logger.info(message, auditContext);
    }
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

  /**
   * Flush all transports
   */
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }

  /**
   * Add custom transport
   */
  addTransport(transport: winston.transport): void {
    this.logger.add(transport);
  }

  /**
   * Remove transport
   */
  removeTransport(transport: winston.transport): void {
    this.logger.remove(transport);
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

  http(message: string, context?: LogContext & { method?: string; url?: string; statusCode?: number; responseTime?: number }): void {
    this.parent.http(message, this.mergeContext(context));
  }

  performance(message: string, context: PerformanceLogContext): void {
    this.parent.performance(message, { ...context, ...this.persistentContext });
  }

  audit(message: string, context: AuditLogContext): void {
    this.parent.audit(message, { ...context, ...this.persistentContext });
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
    this.parent.cost(message, this.mergeContext(context));
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