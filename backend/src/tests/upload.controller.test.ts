/**
 * Upload Controller Tests
 * Test suite for file upload and job management endpoints
 */

import request from 'supertest';
import { UploadController } from '@/controllers/upload.controller';
import { queueManager } from '@/jobs/queue-manager';
import { database } from '@/config/database';
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';

// Mock dependencies
jest.mock('@/jobs/queue-manager', () => ({
  queueManager: {
    addCSVProcessingJob: jest.fn(),
    getJob: jest.fn(),
  },
}));

jest.mock('@/config/database', () => ({
  database: {
    query: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logError: jest.fn(),
  logAudit: jest.fn(),
}));

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Mock authentication middleware
  app.use((req, res, next) => {
    (req as any).user = { id: 'test-user' };
    next();
  });
  
  return app;
};

describe('Upload Controller', () => {
  let app: express.Application;
  let testFilePath: string;

  beforeAll(async () => {
    app = createTestApp();
    
    // Create test CSV file
    const testDir = path.join(__dirname, 'test-uploads');
    await fs.mkdir(testDir, { recursive: true });
    
    testFilePath = path.join(testDir, 'test.csv');
    const csvContent = [
      'id,name,email',
      '1,John Doe,john@example.com',
      '2,Jane Smith,jane@example.com',
    ].join('\n');
    
    await fs.writeFile(testFilePath, csvContent);
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      await fs.rm(path.dirname(testFilePath), { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadCSV', () => {
    beforeEach(() => {
      // Setup default mocks
      const mockQueueManager = queueManager as jest.Mocked<typeof queueManager>;
      const mockDatabase = database as jest.Mocked<typeof database>;
      
      mockQueueManager.addCSVProcessingJob.mockResolvedValue({
        id: 'queue-job-123',
        data: {},
        opts: {},
      } as any);
      
      mockDatabase.query.mockResolvedValue({ rows: [], rowCount: 1 });
    });

    it('should upload CSV file successfully', async () => {
      const mockReq = {
        file: {
          originalname: 'test.csv',
          path: testFilePath,
          size: 100,
          mimetype: 'text/csv',
        },
        body: {
          hasHeaders: 'true',
          delimiter: ',',
          encoding: 'utf8',
          skipEmptyLines: 'true',
        },
        user: { id: 'test-user' },
      } as any;

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      const mockNext = jest.fn();

      await UploadController.uploadCSV(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            jobId: expect.any(String),
            filename: 'test.csv',
            fileSize: 100,
            status: 'queued',
          }),
        })
      );
    });

    it('should return error when no file uploaded', async () => {
      const mockReq = {
        body: {},
        user: { id: 'test-user' },
      } as any;

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      const mockNext = jest.fn();

      await UploadController.uploadCSV(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No file uploaded',
          code: 'MISSING_FILE',
        })
      );
    });

    it('should handle file validation errors', async () => {
      const mockReq = {
        file: {
          originalname: 'test.csv',
          path: '/invalid/path',
          size: 100,
          mimetype: 'text/csv',
        },
        body: {},
        user: { id: 'test-user' },
      } as any;

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      const mockNext = jest.fn();

      await UploadController.uploadCSV(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INVALID_FILE',
        })
      );
    });

    it('should handle processing options correctly', async () => {
      const mockReq = {
        file: {
          originalname: 'test.csv',
          path: testFilePath,
          size: 100,
          mimetype: 'text/csv',
        },
        body: {
          hasHeaders: 'false',
          delimiter: ';',
          encoding: 'utf16',
          skipEmptyLines: 'false',
          maxRows: '1000',
        },
        user: { id: 'test-user' },
      } as any;

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      const mockNext = jest.fn();

      await UploadController.uploadCSV(mockReq, mockRes, mockNext);

      expect(queueManager.addCSVProcessingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            hasHeaders: false,
            delimiter: ';',
            encoding: 'utf16',
            skipEmptyLines: false,
            maxRows: 1000,
          },
        })
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return job status successfully', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockResolvedValue({
        rows: [{
          id: 'job-123',
          status: 'processing',
          progress_percentage: 50,
          original_filename: 'test.csv',
          file_size: 1000,
          rows_processed: 500,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      });

      const mockReq = {
        params: { jobId: 'job-123' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.getJobStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            jobId: 'job-123',
            status: 'processing',
            progress: 50,
            filename: 'test.csv',
          }),
        })
      );
    });

    it('should return 404 for non-existent job', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const mockReq = {
        params: { jobId: 'non-existent' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.getJobStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        })
      );
    });

    it('should return 400 for missing job ID', async () => {
      const mockReq = {
        params: {},
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.getJobStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Job ID is required',
          code: 'MISSING_JOB_ID',
        })
      );
    });
  });

  describe('getUploadJobs', () => {
    it('should return paginated job list', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      
      // Mock jobs query
      mockDatabase.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'job-1',
              status: 'completed',
              progress_percentage: 100,
              original_filename: 'file1.csv',
              created_at: new Date(),
            },
            {
              id: 'job-2',
              status: 'processing',
              progress_percentage: 50,
              original_filename: 'file2.csv',
              created_at: new Date(),
            },
          ],
          rowCount: 2,
        })
        // Mock count query
        .mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 });

      const mockReq = {
        query: { limit: '5', offset: '0' },
        user: { id: 'test-user' },
      } as any;

      const mockRes = {
        json: jest.fn(),
      } as any;

      await UploadController.getUploadJobs(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                jobId: 'job-1',
                status: 'completed',
              }),
              expect.objectContaining({
                jobId: 'job-2',
                status: 'processing',
              }),
            ]),
            pagination: expect.objectContaining({
              total: 10,
              limit: 5,
              offset: 0,
              hasMore: true,
            }),
          }),
        })
      );
    });

    it('should filter jobs by status', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const mockReq = {
        query: { status: 'failed' },
        user: { id: 'test-user' },
      } as any;

      const mockRes = {
        json: jest.fn(),
      } as any;

      await UploadController.getUploadJobs(mockReq, mockRes);

      // Verify that the status filter was applied in the query
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('AND uj.status = $'),
        expect.arrayContaining(['test-user', 'failed'])
      );
    });
  });

  describe('retryJob', () => {
    it('should retry failed job successfully', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      const mockQueueManager = queueManager as jest.Mocked<typeof queueManager>;
      
      // Mock job query
      mockDatabase.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'job-123',
            status: 'failed',
            retry_count: 1,
            max_retries: 3,
            file_path: testFilePath,
            original_filename: 'test.csv',
            file_size: 1000,
            mime_type: 'text/csv',
            created_by: 'test-user',
          }],
          rowCount: 1,
        })
        // Mock update query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockQueueManager.addCSVProcessingJob.mockResolvedValue({
        id: 'retry-job-456',
      } as any);

      const mockReq = {
        params: { jobId: 'job-123' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.retryJob(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            jobId: 'job-123',
            retryCount: 2,
            status: 'pending',
          }),
        })
      );
    });

    it('should reject retry for non-failed jobs', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockResolvedValue({
        rows: [{
          id: 'job-123',
          status: 'processing',
          retry_count: 0,
          max_retries: 3,
        }],
        rowCount: 1,
      });

      const mockReq = {
        params: { jobId: 'job-123' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.retryJob(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Only failed jobs can be retried',
          code: 'INVALID_STATUS',
        })
      );
    });

    it('should reject retry when max retries exceeded', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockResolvedValue({
        rows: [{
          id: 'job-123',
          status: 'failed',
          retry_count: 3,
          max_retries: 3,
        }],
        rowCount: 1,
      });

      const mockReq = {
        params: { jobId: 'job-123' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.retryJob(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Maximum retry attempts exceeded',
          code: 'MAX_RETRIES_EXCEEDED',
        })
      );
    });
  });

  describe('cancelJob', () => {
    it('should cancel pending job successfully', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      
      // Mock job query
      mockDatabase.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'job-123',
            status: 'pending',
            file_path: testFilePath,
            created_by: 'test-user',
          }],
          rowCount: 1,
        })
        // Mock update query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const mockReq = {
        params: { jobId: 'job-123' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.cancelJob(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { jobId: 'job-123', status: 'cancelled' },
          message: 'Job cancelled successfully',
        })
      );
    });

    it('should reject cancellation for completed jobs', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockResolvedValue({
        rows: [{
          id: 'job-123',
          status: 'completed',
        }],
        rowCount: 1,
      });

      const mockReq = {
        params: { jobId: 'job-123' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.cancelJob(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Only pending or processing jobs can be cancelled',
          code: 'INVALID_STATUS',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockRejectedValue(new Error('Database connection failed'));

      const mockReq = {
        params: { jobId: 'job-123' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await UploadController.getJobStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Failed to get job status',
          code: 'STATUS_ERROR',
        })
      );
    });

    it('should handle queue manager errors gracefully', async () => {
      const mockQueueManager = queueManager as jest.Mocked<typeof queueManager>;
      mockQueueManager.addCSVProcessingJob.mockRejectedValue(new Error('Queue connection failed'));

      const mockReq = {
        file: {
          originalname: 'test.csv',
          path: testFilePath,
          size: 100,
          mimetype: 'text/csv',
        },
        body: {},
        user: { id: 'test-user' },
      } as any;

      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      const mockNext = jest.fn();

      await UploadController.uploadCSV(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Internal server error during file upload',
          code: 'UPLOAD_ERROR',
        })
      );
    });
  });
});