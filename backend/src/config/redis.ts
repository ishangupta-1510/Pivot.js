/**
 * Redis Configuration
 * Optimized Redis connection for BullMQ and caching
 */

import IORedis, { RedisOptions } from 'ioredis';
import { config } from './environment';
import { logger } from '@/utils/logger';

class RedisManager {
  private static instance: RedisManager;
  private redisClient: IORedis | null = null;
  private subscriberClient: IORedis | null = null;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  public async initialize(): Promise<void> {
    try {
      // Parse REDIS_URL if available (for Docker)
      const redisOptions: RedisOptions = config.redis.url 
        ? {} // IORedis will parse the URL from the connection string
        : {
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            db: config.redis.db,
        
        // Connection settings
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest || 3,
        connectTimeout: 10000,
        lazyConnect: true,
        keepAlive: 30000,
        
          };

      // Create main Redis client
      this.redisClient = config.redis.url 
        ? new IORedis(config.redis.url)
        : new IORedis(redisOptions);
      
      // Create subscriber client for pub/sub (separate connection recommended)
      this.subscriberClient = config.redis.url
        ? new IORedis(config.redis.url)
        : new IORedis(redisOptions);

      // Set up event handlers
      this.setupEventHandlers();
      
      // Connect both clients (only if not using URL - URL auto-connects)
      if (!config.redis.url) {
        await Promise.all([
          this.redisClient.connect(),
          this.subscriberClient.connect()
        ]);
      }
      
      // Test connection
      await this.testConnection();
      
      this.isConnected = true;
      logger.info('✅ Redis connection established successfully', {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
      });
      
    } catch (error) {
      logger.error('❌ Redis connection failed:', error);
      throw new Error(`Redis initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private setupEventHandlers(): void {
    if (!this.redisClient || !this.subscriberClient) return;

    // Main client events
    this.redisClient.on('connect', () => {
      logger.debug('📡 Redis client connected');
    });

    this.redisClient.on('ready', () => {
      logger.debug('🟢 Redis client ready');
    });

    this.redisClient.on('error', (error) => {
      logger.error('💥 Redis client error:', error);
    });

    this.redisClient.on('close', () => {
      logger.warn('🔴 Redis client connection closed');
      this.isConnected = false;
    });

    this.redisClient.on('reconnecting', () => {
      logger.info('🔄 Redis client reconnecting...');
    });

    // Subscriber client events
    this.subscriberClient.on('connect', () => {
      logger.debug('📡 Redis subscriber connected');
    });

    this.subscriberClient.on('error', (error) => {
      logger.error('💥 Redis subscriber error:', error);
    });
  }

  private async testConnection(): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    try {
      const result = await this.redisClient.ping();
      if (result !== 'PONG') {
        throw new Error('Redis ping test failed');
      }
      
      // Test basic operations
      await this.redisClient.set('test:connection', 'success', 'EX', 10);
      const testResult = await this.redisClient.get('test:connection');
      
      if (testResult !== 'success') {
        throw new Error('Redis read/write test failed');
      }
      
      logger.info('🔗 Redis connection test successful');
      
    } catch (error) {
      logger.error('Redis connection test failed:', error);
      throw error;
    }
  }

  public getClient(): IORedis {
    if (!this.redisClient || !this.isConnected) {
      throw new Error('Redis not connected. Call initialize() first.');
    }
    return this.redisClient;
  }

  public getSubscriberClient(): IORedis {
    if (!this.subscriberClient || !this.isConnected) {
      throw new Error('Redis subscriber not connected. Call initialize() first.');
    }
    return this.subscriberClient;
  }

  public async healthCheck(): Promise<{ healthy: boolean; latency: number; memory: string }> {
    if (!this.redisClient || !this.isConnected) {
      return { healthy: false, latency: -1, memory: 'N/A' };
    }

    const start = Date.now();
    try {
      await this.redisClient.ping();
      const info = await this.redisClient.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)\r?\n/);
      const memory = memoryMatch ? memoryMatch[1] : 'Unknown';
      
      return { 
        healthy: true, 
        latency: Date.now() - start,
        memory: memory.trim()
      };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return { healthy: false, latency: -1, memory: 'N/A' };
    }
  }

  public async getStats(): Promise<{
    connectedClients: number;
    usedMemory: string;
    totalCommandsProcessed: number;
    keyspaceHits: number;
    keyspaceMisses: number;
    hitRate: number;
  }> {
    if (!this.redisClient || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      const info = await this.redisClient.info();
      
      const parseInfo = (key: string): string => {
        const match = info.match(new RegExp(`${key}:(.+)\r?\n`));
        return match ? match[1].trim() : '0';
      };

      const keyspaceHits = parseInt(parseInfo('keyspace_hits'));
      const keyspaceMisses = parseInt(parseInfo('keyspace_misses'));
      const hitRate = keyspaceHits + keyspaceMisses > 0 
        ? (keyspaceHits / (keyspaceHits + keyspaceMisses)) * 100 
        : 0;

      return {
        connectedClients: parseInt(parseInfo('connected_clients')),
        usedMemory: parseInfo('used_memory_human'),
        totalCommandsProcessed: parseInt(parseInfo('total_commands_processed')),
        keyspaceHits,
        keyspaceMisses,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get Redis stats:', error);
      throw error;
    }
  }

  public async flushDatabase(): Promise<void> {
    if (!this.redisClient || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    if (config.env === 'production') {
      throw new Error('Cannot flush database in production');
    }

    await this.redisClient.flushdb();
    logger.warn('🗑️ Redis database flushed');
  }

  public async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.disconnect();
      this.redisClient = null;
    }

    if (this.subscriberClient) {
      await this.subscriberClient.disconnect();
      this.subscriberClient = null;
    }

    this.isConnected = false;
    logger.info('🔌 Redis connections closed');
  }
}

// Export singleton instance
export const redis = RedisManager.getInstance();

// Export helper function
export const getRedisClient = () => redis.getClient();