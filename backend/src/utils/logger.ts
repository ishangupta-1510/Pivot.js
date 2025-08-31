/**
 * Logger Utility
 * Production-ready logging with Winston, structured logging, and multiple transports
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '@/config/environment';

// Ensure logs directory exists
const logsDir = path.dirname(config.logging.file);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const logObject = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(Object.keys(meta).length > 0 && { meta }),
    };
    
    if (config.logging.format === 'simple') {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${
        Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : ''
      }`;
    }
    
    return JSON.stringify(logObject);
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: customFormat,
  defaultMeta: {
    service: 'pivot-grid-backend',
    environment: config.env,
    pid: process.pid,
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      silent: config.env === 'test',
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    
    // Error file transport
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// Add performance logging transport for production
if (config.env === 'production') {
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'performance.log'),
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf(({ timestamp, message, ...meta }) => {
        if (typeof message === 'string' && (message.includes('performance') || meta.duration !== undefined)) {
          return JSON.stringify({ timestamp, message, ...meta });
        }
        return '';
      })
    ),
  }));
}

// Helper functions for structured logging
export const createLogger = (module: string) => {
  return {
    info: (message: string, meta?: object) => logger.info(message, { module, ...meta }),
    warn: (message: string, meta?: object) => logger.warn(message, { module, ...meta }),
    error: (message: string, meta?: object) => logger.error(message, { module, ...meta }),
    debug: (message: string, meta?: object) => logger.debug(message, { module, ...meta }),
  };
};

// Performance measurement helper
export const measurePerformance = (operation: string, startTime: number, meta?: object) => {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation}`, {
    operation,
    duration,
    durationMs: duration,
    performance: true,
    ...meta,
  });
  return duration;
};

// Database query logging helper
export const logDatabaseQuery = (query: string, params: any[], duration: number, rowCount?: number) => {
  const queryPreview = query.replace(/\s+/g, ' ').substring(0, 100);
  
  logger.info('Database Query', {
    database: true,
    queryPreview: queryPreview + (query.length > 100 ? '...' : ''),
    paramCount: params.length,
    duration,
    rowCount,
    slow: duration > config.database.slowQueryThreshold,
  });
};

// HTTP request logging helper
export const logHttpRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  userAgent?: string,
  userId?: string
) => {
  logger.info('HTTP Request', {
    http: true,
    method,
    url,
    statusCode,
    duration,
    userAgent,
    userId,
    slow: duration > 1000,
  });
};

// Job processing logging helper
export const logJobEvent = (
  jobId: string,
  event: string,
  queueName: string,
  meta?: object
) => {
  logger.info(`Job ${event}`, {
    job: true,
    jobId,
    event,
    queueName,
    ...meta,
  });
};

// Security event logging helper
export const logSecurityEvent = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  meta?: object
) => {
  logger.warn(`Security Event: ${event}`, {
    security: true,
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

// Error logging with context
export const logError = (error: Error | unknown, context: string, meta?: object) => {
  if (error instanceof Error) {
    logger.error(`Error in ${context}: ${error.message}`, {
      error: true,
      context,
      errorMessage: error.message,
      errorStack: error.stack,
      ...meta,
    });
  } else {
    logger.error(`Unknown error in ${context}`, {
      error: true,
      context,
      errorData: error,
      ...meta,
    });
  }
};

// Audit logging helper
export const logAudit = (
  action: string,
  resource: string,
  userId?: string,
  meta?: object
) => {
  logger.info(`Audit: ${action}`, {
    audit: true,
    action,
    resource,
    userId,
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

// System health logging
export const logHealthCheck = (
  component: string,
  healthy: boolean,
  meta?: object
) => {
  const level = healthy ? 'info' : 'error';
  logger[level](`Health Check: ${component}`, {
    health: true,
    component,
    healthy,
    ...meta,
  });
};

// Custom log levels for specific use cases
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
});

export { logger };
export default logger;