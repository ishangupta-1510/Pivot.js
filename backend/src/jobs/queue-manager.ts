/**
 * Queue Manager
 * Central management for all BullMQ queues with monitoring and health checks
 */

import { Queue, QueueOptions, Job, JobsOptions } from 'bullmq';
import { Worker, WorkerOptions } from 'bullmq';
import { QueueEvents } from 'bullmq';
import { redis } from '@/config/redis';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { eventManager } from '@/services/event-manager';

export interface JobProgress {
  percentage: number;
  processedRows: number;
  totalRows?: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
  processingSpeed?: number;
}

export interface CSVProcessingJobData {
  jobId: string;
  filePath: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  userId?: string;
  options: {
    hasHeaders: boolean;
    delimiter: string;
    encoding: string;
    skipEmptyLines: boolean;
    maxRows?: number;
  };
}

export interface DataValidationJobData {
  datasetId: string;
  validationRules: {
    requiredColumns?: string[];
    dataTypes?: Record<string, string>;
    customValidators?: string[];
  };
}

export interface AnalyticsJobData {
  datasetId: string;
  analysisType: 'summary' | 'correlation' | 'distribution' | 'outliers';
  columns: string[];
  options?: Record<string, any>;
}

class QueueManager {
  private static instance: QueueManager;
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private queueEvents = new Map<string, QueueEvents>();
  private eventManager = eventManager;
  private isInitialized = false;

  private constructor() {
    // EventManager is already initialized
  }

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Queue manager already initialized');
      return;
    }

    try {
      const redisConnection = {
        connection: redis.getClient(),
      };

      // Initialize queues
      await this.createQueue('csv-processing', redisConnection);
      await this.createQueue('data-validation', redisConnection);
      await this.createQueue('analytics', redisConnection);
      await this.createQueue('cleanup', redisConnection);

      // Setup queue event listeners
      this.setupQueueEventListeners();

      this.isInitialized = true;
      logger.info('✅ Queue Manager initialized successfully', {
        queues: Array.from(this.queues.keys()),
        workers: Array.from(this.workers.keys()),
      });

    } catch (error) {
      logger.error('❌ Queue Manager initialization failed:', error);
      throw new Error(`Queue Manager initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createQueue(name: string, redisConnection: any): Promise<Queue> {
    const queueOptions: QueueOptions = {
      connection: redisConnection.connection,
      defaultJobOptions: {
        ...config.jobs.defaultOptions,
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    };

    const queue = new Queue(name, queueOptions);
    this.queues.set(name, queue);

    // Create queue events listener
    const queueEvents = new QueueEvents(name, redisConnection);
    this.queueEvents.set(name, queueEvents);

    logger.info(`📋 Queue '${name}' created successfully`);
    return queue;
  }

  private setupQueueEventListeners(): void {
    this.queueEvents.forEach((queueEvents, queueName) => {
      queueEvents.on('waiting', ({ jobId }) => {
        logger.debug(`📋 Job ${jobId} is waiting in queue ${queueName}`);
        this.eventManager.emit('job:waiting', { jobId, queueName });
      });

      queueEvents.on('active', ({ jobId, prev }) => {
        logger.info(`🔄 Job ${jobId} is now active in queue ${queueName}`);
        this.eventManager.emit('job:active', { jobId, queueName, previous: prev });
      });

      queueEvents.on('completed', ({ jobId, returnvalue }) => {
        logger.info(`✅ Job ${jobId} completed in queue ${queueName}`);
        this.eventManager.emit('job:completed', { 
          jobId, 
          queueName, 
          result: returnvalue 
        });
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        logger.error(`❌ Job ${jobId} failed in queue ${queueName}:`, failedReason);
        this.eventManager.emit('job:failed', { 
          jobId, 
          queueName, 
          error: failedReason 
        });
      });

      queueEvents.on('progress', ({ jobId, data }) => {
        const percentage = typeof data === 'object' && data !== null && 'percentage' in data 
          ? (data as any).percentage 
          : data;
        logger.debug(`📊 Job ${jobId} progress: ${percentage}%`);
        this.eventManager.emit('job:progress', { 
          jobId, 
          queueName, 
          progress: data 
        });
      });

      queueEvents.on('stalled', ({ jobId }) => {
        logger.warn(`⚠️ Job ${jobId} stalled in queue ${queueName}`);
        this.eventManager.emit('job:stalled', { jobId, queueName });
      });
    });
  }

  public async addJob<T = any>(
    queueName: string, 
    jobName: string, 
    data: T, 
    options?: JobsOptions
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const jobOptions: JobsOptions = {
      ...config.jobs.defaultOptions,
      ...options,
      jobId: options?.jobId || `${queueName}-${jobName}-${Date.now()}`,
    };

    const job = await queue.add(jobName, data, jobOptions);
    
    logger.info(`➕ Job added to queue`, {
      jobId: job.id,
      queueName,
      jobName,
      priority: jobOptions.priority,
    });

    return job;
  }

  public async addCSVProcessingJob(
    data: CSVProcessingJobData, 
    options?: JobsOptions
  ): Promise<Job<CSVProcessingJobData>> {
    return this.addJob('csv-processing', 'process-csv', data, {
      priority: 10,
      delay: 0,
      ...options,
    });
  }

  public async addDataValidationJob(
    data: DataValidationJobData,
    options?: JobsOptions
  ): Promise<Job<DataValidationJobData>> {
    return this.addJob('data-validation', 'validate-data', data, {
      priority: 5,
      ...options,
    });
  }

  public async addAnalyticsJob(
    data: AnalyticsJobData,
    options?: JobsOptions
  ): Promise<Job<AnalyticsJobData>> {
    return this.addJob('analytics', 'analyze-data', data, {
      priority: 3,
      ...options,
    });
  }

  public async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    return (await queue.getJob(jobId)) || null;
  }

  public async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
      queue.getWaitingCount(),
    ]);

    return {
      name: queueName,
      counts: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: paused,
      },
      jobs: {
        waiting: waiting.map((job: any) => ({ id: job.id, name: job.name, data: job.data })),
        active: active.map((job: any) => ({ id: job.id, name: job.name, progress: job.progress })),
        failed: failed.slice(0, 10).map((job: any) => ({ 
          id: job.id, 
          name: job.name, 
          error: job.failedReason 
        })),
      },
    };
  }

  public async getAllQueuesStats() {
    const stats = [];
    
    for (const queueName of this.queues.keys()) {
      try {
        const queueStats = await this.getQueueStats(queueName);
        stats.push(queueStats);
      } catch (error) {
        logger.error(`Failed to get stats for queue ${queueName}:`, error);
        stats.push({
          name: queueName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return stats;
  }

  public async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.pause();
    logger.info(`⏸️ Queue '${queueName}' paused`);
  }

  public async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.resume();
    logger.info(`▶️ Queue '${queueName}' resumed`);
  }

  public async cleanQueue(
    queueName: string, 
    grace: number = 5000, 
    limit: number = 100
  ): Promise<string[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const jobs = await queue.clean(grace, limit);
    logger.info(`🧹 Cleaned ${jobs.length} jobs from queue '${queueName}'`);
    
    return jobs;
  }

  public async retryFailedJobs(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const failedJobs = await queue.getFailed();
    
    for (const job of failedJobs) {
      await job.retry();
    }

    logger.info(`🔄 Retried ${failedJobs.length} failed jobs in queue '${queueName}'`);
  }

  public async obliterate(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.obliterate({ force: true });
    logger.warn(`💥 Queue '${queueName}' obliterated (all jobs removed)`);
  }

  public async healthCheck(): Promise<{
    healthy: boolean;
    queues: Record<string, { healthy: boolean; error?: string }>;
    redis: { healthy: boolean; latency: number };
  }> {
    const redisHealth = await redis.healthCheck();
    const queueHealth: Record<string, { healthy: boolean; error?: string }> = {};

    for (const [queueName, queue] of this.queues.entries()) {
      try {
        await queue.getWaiting(0, 0);
        queueHealth[queueName] = { healthy: true };
      } catch (error) {
        queueHealth[queueName] = {
          healthy: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    const allQueuesHealthy = Object.values(queueHealth).every(q => q.healthy);

    return {
      healthy: redisHealth.healthy && allQueuesHealthy,
      queues: queueHealth,
      redis: redisHealth,
    };
  }

  public async close(): Promise<void> {
    logger.info('🔌 Closing Queue Manager...');

    // Close all workers first
    for (const [name, worker] of this.workers.entries()) {
      try {
        await worker.close();
        logger.debug(`Worker '${name}' closed`);
      } catch (error) {
        logger.error(`Error closing worker '${name}':`, error);
      }
    }

    // Close all queue events
    for (const [name, queueEvents] of this.queueEvents.entries()) {
      try {
        await queueEvents.close();
        logger.debug(`Queue events '${name}' closed`);
      } catch (error) {
        logger.error(`Error closing queue events '${name}':`, error);
      }
    }

    // Close all queues
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
        logger.debug(`Queue '${name}' closed`);
      } catch (error) {
        logger.error(`Error closing queue '${name}':`, error);
      }
    }

    this.workers.clear();
    this.queueEvents.clear();
    this.queues.clear();
    this.isInitialized = false;

    logger.info('✅ Queue Manager closed successfully');
  }

  public registerWorker(name: string, worker: Worker): void {
    this.workers.set(name, worker);
    logger.info(`👷 Worker '${name}' registered`);
  }

  public getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  public getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }
}

// Export singleton instance
export const queueManager = QueueManager.getInstance();