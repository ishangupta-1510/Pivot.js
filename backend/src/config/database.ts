/**
 * Database Configuration
 * Production-ready PostgreSQL connection with pooling and optimization
 */

import { Pool, PoolConfig } from 'pg';
import { config } from './environment';
import { logger } from '@/utils/logger';

interface DatabaseConfig extends PoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | object;
}

class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: Pool | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Use DATABASE_URL if available (for Docker), otherwise use individual config
      const dbConfig: DatabaseConfig = config.database.url 
        ? { connectionString: config.database.url } as any
        : {
            host: config.database.host,
            port: config.database.port,
            database: config.database.name,
            user: config.database.user,
            password: config.database.password,
        
        // Connection pool settings
        min: config.database.pool.min,
        max: config.database.pool.max,
        idleTimeoutMillis: config.database.pool.idleTimeout,
        connectionTimeoutMillis: config.database.pool.connectionTimeout,
        
        // Performance settings
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        
        // SSL configuration
        ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
        
        // Application name for monitoring
        application_name: `pivot-grid-backend-${config.env}`,
          };

      this.pool = new Pool(dbConfig);
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Test connection
      await this.testConnection();
      
      this.isConnected = true;
      logger.info('✅ Database connection established successfully', {
        host: dbConfig.host,
        database: dbConfig.database,
        poolSize: dbConfig.max,
      });
      
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      throw new Error(`Database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private setupEventHandlers(): void {
    if (!this.pool) return;

    this.pool.on('connect', (client: any) => {
      logger.debug('📡 New database client connected', {
        processID: client.processID || 'unknown',
        database: client.database || 'unknown',
      });
    });

    this.pool.on('error', (error) => {
      logger.error('💥 Database pool error:', error);
    });

    this.pool.on('remove', (client: any) => {
      logger.debug('🔌 Database client disconnected', {
        processID: client.processID || 'unknown',
      });
    });
  }

  private async testConnection(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT NOW() as server_time, version() as server_version');
      logger.info('🔗 Database connection test successful', {
        serverTime: result.rows[0].server_time,
        version: result.rows[0].server_version.split(' ')[0],
      });
    } finally {
      client.release();
    }
  }

  public async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database not connected. Call initialize() first.');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      // Log slow queries
      if (duration > config.database.slowQueryThreshold) {
        logger.warn('🐌 Slow query detected', {
          query: text.substring(0, 100) + '...',
          duration,
          rowCount: result.rowCount,
        });
      }

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      logger.error('💥 Database query error:', {
        query: text.substring(0, 100) + '...',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - start,
      });
      throw error;
    }
  }

  public async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    if (!this.pool || !this.isConnected) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async getStats(): Promise<{
    totalConnections: number;
    idleConnections: number;
    waitingConnections: number;
  }> {
    if (!this.pool) {
      return { totalConnections: 0, idleConnections: 0, waitingConnections: 0 };
    }

    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingConnections: this.pool.waitingCount,
    };
  }

  public async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    if (!this.pool || !this.isConnected) {
      return { healthy: false, latency: -1 };
    }

    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { healthy: true, latency: Date.now() - start };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return { healthy: false, latency: -1 };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      logger.info('🔌 Database connection closed');
    }
  }
}

// Export singleton instance
export const database = DatabaseManager.getInstance();

// Export helper functions
export const query = <T = any>(text: string, params?: any[]) => database.query<T>(text, params);
export const transaction = <T>(callback: (client: any) => Promise<T>) => database.transaction(callback);