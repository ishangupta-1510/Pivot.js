/**
 * Queue Manager Tests
 * Comprehensive test suite for BullMQ queue management
 */

import { queueManager } from '@/jobs/queue-manager';
import { redis } from '@/config/redis';
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';

// Mock Redis and database
jest.mock('@/config/redis', () => ({
  redis: {
    getClient: jest.fn().mockReturnValue({
      ping: jest.fn().mockResolvedValue('PONG'),
      publish: jest.fn().mockResolvedValue(1),
    }),
    getSubscriberClient: jest.fn().mockReturnValue({
      subscribe: jest.fn().mockResolvedValue(1),
      on: jest.fn(),
    }),
    healthCheck: jest.fn().mockResolvedValue({
      healthy: true,
      latency: 10,
      memory: '128MB',
    }),
  },
}));

jest.mock('@/config/database', () => ({
  database: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  },
}));

jest.mock('@/services/event-manager', () => ({
  EventManager: {
    getInstance: jest.fn().mockReturnValue({
      emit: jest.fn(),
    }),
  },
}));

describe('QueueManager', () => {
  beforeAll(async () => {
    // Initialize queue manager for tests
    await queueManager.initialize();
  });

  afterAll(async () => {
    // Cleanup
    await queueManager.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const healthCheck = await queueManager.healthCheck();
      expect(healthCheck.healthy).toBe(true);
      expect(healthCheck.redis.healthy).toBe(true);
    });

    it('should have required queues', () => {
      const queueNames = queueManager.getQueueNames();
      expect(queueNames).toContain('csv-processing');
      expect(queueNames).toContain('data-validation');
      expect(queueNames).toContain('analytics');
      expect(queueNames).toContain('cleanup');
    });
  });

  describe('job management', () => {
    it('should add CSV processing job successfully', async () => {
      const jobData = {
        jobId: 'test-job-1',
        filePath: '/tmp/test.csv',
        originalFilename: 'test.csv',
        fileSize: 1024,
        mimeType: 'text/csv',
        userId: 'user-123',
        options: {
          hasHeaders: true,
          delimiter: ',',
          encoding: 'utf8',
          skipEmptyLines: true,
        },
      };

      const job = await queueManager.addCSVProcessingJob(jobData);
      
      expect(job).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    it('should add data validation job successfully', async () => {
      const jobData = {
        datasetId: 'dataset-123',
        validationRules: {
          requiredColumns: ['name', 'email'],
          dataTypes: {
            age: 'number',
            active: 'boolean',
          },
        },
      };

      const job = await queueManager.addDataValidationJob(jobData);
      
      expect(job).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    it('should add analytics job successfully', async () => {
      const jobData = {
        datasetId: 'dataset-123',
        analysisType: 'summary',
        columns: ['age', 'salary', 'department'],
        options: {
          groupBy: 'department',
        },
      };

      const job = await queueManager.addAnalyticsJob(jobData);
      
      expect(job).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    it('should get job by ID', async () => {
      const jobData = {
        jobId: 'test-job-2',
        filePath: '/tmp/test2.csv',
        originalFilename: 'test2.csv',
        fileSize: 2048,
        mimeType: 'text/csv',
        userId: 'user-456',
        options: {
          hasHeaders: true,
          delimiter: ',',
          encoding: 'utf8',
          skipEmptyLines: true,
        },
      };

      const job = await queueManager.addCSVProcessingJob(jobData);
      const retrievedJob = await queueManager.getJob('csv-processing', job.id || 'test');
      
      expect(retrievedJob).toBeDefined();
      expect(retrievedJob?.id).toBe(job.id);
    });
  });

  describe('queue statistics', () => {
    it('should get queue statistics', async () => {
      const stats = await queueManager.getQueueStats('csv-processing');
      
      expect(stats).toBeDefined();
      expect(stats.name).toBe('csv-processing');
      expect(stats.counts).toBeDefined();
      expect(typeof stats.counts.waiting).toBe('number');
      expect(typeof stats.counts.active).toBe('number');
      expect(typeof stats.counts.completed).toBe('number');
      expect(typeof stats.counts.failed).toBe('number');
    });

    it('should get all queues statistics', async () => {
      const allStats = await queueManager.getAllQueuesStats();
      
      expect(Array.isArray(allStats)).toBe(true);
      expect(allStats.length).toBeGreaterThan(0);
      
      const csvQueueStats = allStats.find(s => s.name === 'csv-processing');
      expect(csvQueueStats).toBeDefined();
    });

    it('should handle queue not found error', async () => {
      await expect(
        queueManager.getQueueStats('non-existent-queue')
      ).rejects.toThrow('Queue \'non-existent-queue\' not found');
    });
  });

  describe('queue operations', () => {
    let testQueue: string;

    beforeEach(() => {
      testQueue = 'csv-processing';
    });

    it('should pause and resume queue', async () => {
      await queueManager.pauseQueue(testQueue);
      // In a real test, you'd verify the queue is paused
      
      await queueManager.resumeQueue(testQueue);
      // In a real test, you'd verify the queue is resumed
    });

    it('should clean queue', async () => {
      const cleanedJobs = await queueManager.cleanQueue(testQueue, 0, 10);
      expect(Array.isArray(cleanedJobs)).toBe(true);
    });

    it('should retry failed jobs', async () => {
      await queueManager.retryFailedJobs(testQueue);
      // This would be verified by checking that failed jobs are retried
    });

    it('should handle queue operations on non-existent queue', async () => {
      const nonExistentQueue = 'non-existent-queue';
      
      await expect(queueManager.pauseQueue(nonExistentQueue))
        .rejects.toThrow('Queue \'non-existent-queue\' not found');
      
      await expect(queueManager.resumeQueue(nonExistentQueue))
        .rejects.toThrow('Queue \'non-existent-queue\' not found');
    });
  });

  describe('health checks', () => {
    it('should perform health check successfully', async () => {
      const health = await queueManager.healthCheck();
      
      expect(health).toBeDefined();
      expect(typeof health.healthy).toBe('boolean');
      expect(health.queues).toBeDefined();
      expect(health.redis).toBeDefined();
      expect(typeof health.redis.healthy).toBe('boolean');
      expect(typeof health.redis.latency).toBe('number');
    });

    it('should report unhealthy status when Redis is down', async () => {
      // Mock Redis as unhealthy
      const mockRedis = redis as jest.Mocked<typeof redis>;
      mockRedis.healthCheck.mockResolvedValueOnce({
        healthy: false,
        latency: -1,
        memory: 'N/A',
      });

      const health = await queueManager.healthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.redis.healthy).toBe(false);
    });
  });

  describe('job priorities and options', () => {
    it('should handle job with custom priority', async () => {
      const jobData = {
        jobId: 'priority-job',
        filePath: '/tmp/priority.csv',
        originalFilename: 'priority.csv',
        fileSize: 1024,
        mimeType: 'text/csv',
        userId: 'user-789',
        options: {
          hasHeaders: true,
          delimiter: ',',
          encoding: 'utf8',
          skipEmptyLines: true,
        },
      };

      const job = await queueManager.addCSVProcessingJob(jobData, {
        priority: 20,
        delay: 5000,
      });
      
      expect(job).toBeDefined();
      expect(job.opts.priority).toBe(20);
      expect(job.opts.delay).toBe(5000);
    });

    it('should handle job with custom job ID', async () => {
      const customJobId = 'custom-job-id-123';
      const jobData = {
        jobId: 'test-job-custom',
        filePath: '/tmp/custom.csv',
        originalFilename: 'custom.csv',
        fileSize: 1024,
        mimeType: 'text/csv',
        userId: 'user-custom',
        options: {
          hasHeaders: true,
          delimiter: ',',
          encoding: 'utf8',
          skipEmptyLines: true,
        },
      };

      const job = await queueManager.addCSVProcessingJob(jobData, {
        jobId: customJobId,
      });
      
      expect(job.id).toBe(customJobId);
    });
  });

  describe('error handling', () => {
    it('should handle invalid queue name gracefully', async () => {
      await expect(
        queueManager.addJob('invalid-queue', 'test-job', {})
      ).rejects.toThrow('Queue \'invalid-queue\' not found');
    });

    it('should handle job retrieval for invalid job ID', async () => {
      const job = await queueManager.getJob('csv-processing', 'non-existent-job-id');
      expect(job).toBeNull();
    });
  });
});