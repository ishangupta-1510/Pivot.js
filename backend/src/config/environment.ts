/**
 * Environment Configuration
 * Centralized configuration management with validation
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment validation schema
const environmentSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.union([z.string(), z.number()]).transform(Number).default('3001'),
  HOST: z.string().default('0.0.0.0'),
  
  // Database
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.union([z.string(), z.number()]).transform(Number).default('5432'),
  DB_NAME: z.string().default('pivot_grid_dev'),
  DB_USER: z.string().default('pivot_user'),
  DB_PASSWORD: z.string().default('pivot_secure_password'),
  DB_POOL_MIN: z.union([z.string(), z.number()]).transform(Number).default('2'),
  DB_POOL_MAX: z.union([z.string(), z.number()]).transform(Number).default('20'),
  DB_POOL_IDLE_TIMEOUT: z.union([z.string(), z.number()]).transform(Number).default('30000'),
  DB_POOL_CONNECTION_TIMEOUT: z.union([z.string(), z.number()]).transform(Number).default('10000'),
  DB_SLOW_QUERY_THRESHOLD: z.union([z.string(), z.number()]).transform(Number).default('1000'),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.union([z.string(), z.number()]).transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.union([z.string(), z.number()]).transform(Number).default('0'),
  REDIS_MAX_RETRIES: z.union([z.string(), z.number()]).transform(Number).default('3'),
  REDIS_RETRY_DELAY: z.union([z.string(), z.number()]).transform(Number).default('1000'),
  
  // Authentication
  JWT_SECRET: z.string().default('dev_jwt_secret_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  BCRYPT_ROUNDS: z.union([z.string(), z.number()]).transform(Number).default('12'),
  
  // File Upload
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.union([z.string(), z.number()]).transform(Number).default('5368709120'), // 5GB
  ALLOWED_MIME_TYPES: z.string().default('text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  
  // Job Processing
  BULLMQ_DEFAULT_JOB_OPTIONS: z.string().default('{"attempts": 3, "backoff": {"type": "exponential", "delay": 2000}}'),
  MAX_CONCURRENT_JOBS: z.union([z.string(), z.number()]).transform(Number).default('5'),
  JOB_RETENTION_DAYS: z.union([z.string(), z.number()]).transform(Number).default('7'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  LOG_FILE: z.string().default('./logs/application.log'),
  
  // Security
  CORS_ORIGIN: z.string().default('http://localhost:3002'),
  RATE_LIMIT_WINDOW: z.union([z.string(), z.number()]).transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX: z.union([z.string(), z.number()]).transform(Number).default('100'),
  
  // Monitoring
  HEALTH_CHECK_TIMEOUT: z.union([z.string(), z.number()]).transform(Number).default('5000'),
  METRICS_ENABLED: z.union([z.string(), z.boolean()]).transform((v) => typeof v === 'boolean' ? v : v === 'true').default('true'),
  
  // WebSocket
  WEBSOCKET_CORS_ORIGIN: z.string().default('http://localhost:3002'),
  WEBSOCKET_PING_TIMEOUT: z.union([z.string(), z.number()]).transform(Number).default('20000'),
  WEBSOCKET_PING_INTERVAL: z.union([z.string(), z.number()]).transform(Number).default('25000'),
});

// Validate environment variables
const env = environmentSchema.safeParse(process.env);

if (!env.success) {
  console.error('❌ Invalid environment configuration:', env.error.flatten().fieldErrors);
  process.exit(1);
}

// Export typed configuration
export const config = {
  env: env.data.NODE_ENV,
  port: env.data.PORT,
  host: env.data.HOST,
  
  database: {
    url: env.data.DATABASE_URL,
    host: env.data.DB_HOST,
    port: env.data.DB_PORT,
    name: env.data.DB_NAME,
    user: env.data.DB_USER,
    password: env.data.DB_PASSWORD,
    pool: {
      min: env.data.DB_POOL_MIN,
      max: env.data.DB_POOL_MAX,
      idleTimeout: env.data.DB_POOL_IDLE_TIMEOUT,
      connectionTimeout: env.data.DB_POOL_CONNECTION_TIMEOUT,
    },
    slowQueryThreshold: env.data.DB_SLOW_QUERY_THRESHOLD,
  },
  
  redis: {
    url: env.data.REDIS_URL,
    host: env.data.REDIS_HOST,
    port: env.data.REDIS_PORT,
    password: env.data.REDIS_PASSWORD,
    db: env.data.REDIS_DB,
    maxRetriesPerRequest: env.data.REDIS_MAX_RETRIES,
    retryDelayOnFailover: env.data.REDIS_RETRY_DELAY,
  },
  
  auth: {
    jwtSecret: env.data.JWT_SECRET,
    jwtExpiresIn: env.data.JWT_EXPIRES_IN,
    bcryptRounds: env.data.BCRYPT_ROUNDS,
  },
  
  upload: {
    directory: env.data.UPLOAD_DIR,
    maxFileSize: env.data.MAX_FILE_SIZE,
    allowedMimeTypes: env.data.ALLOWED_MIME_TYPES.split(','),
  },
  
  jobs: {
    defaultOptions: JSON.parse(env.data.BULLMQ_DEFAULT_JOB_OPTIONS),
    maxConcurrent: env.data.MAX_CONCURRENT_JOBS,
    retentionDays: env.data.JOB_RETENTION_DAYS,
  },
  
  logging: {
    level: env.data.LOG_LEVEL,
    format: env.data.LOG_FORMAT,
    file: env.data.LOG_FILE,
  },
  
  security: {
    corsOrigin: env.data.CORS_ORIGIN,
    rateLimit: {
      windowMs: env.data.RATE_LIMIT_WINDOW,
      max: env.data.RATE_LIMIT_MAX,
    },
  },
  
  monitoring: {
    healthCheckTimeout: env.data.HEALTH_CHECK_TIMEOUT,
    metricsEnabled: env.data.METRICS_ENABLED,
  },
  
  websocket: {
    corsOrigin: env.data.WEBSOCKET_CORS_ORIGIN,
    pingTimeout: env.data.WEBSOCKET_PING_TIMEOUT,
    pingInterval: env.data.WEBSOCKET_PING_INTERVAL,
  },
} as const;

// Environment-specific configurations
export const isDevelopment = config.env === 'development';
export const isProduction = config.env === 'production';
export const isTest = config.env === 'test';