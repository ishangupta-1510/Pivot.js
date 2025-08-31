/**
 * CSV Processing Worker Tests
 * Test suite for CSV processing functionality
 */

import CSVProcessingWorker from '@/jobs/csv-processing.worker';
import { database } from '@/config/database';
import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';

// Mock dependencies
jest.mock('@/config/redis', () => ({
  redis: {
    getClient: jest.fn().mockReturnValue({
      ping: jest.fn().mockResolvedValue('PONG'),
    }),
  },
}));

jest.mock('@/config/database', () => ({
  database: {
    query: jest.fn(),
  },
}));

jest.mock('@/services/event-manager', () => ({
  EventManager: {
    getInstance: jest.fn().mockReturnValue({
      emit: jest.fn(),
    }),
  },
}));

describe('CSV Processing Worker', () => {
  let worker: CSVProcessingWorker;
  let testFilePath: string;
  const testDir = path.join(__dirname, 'test-files');

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test CSV file
    testFilePath = path.join(testDir, 'test.csv');
    const csvContent = [
      'id,name,age,email,department',
      '1,John Doe,30,john@example.com,Engineering',
      '2,Jane Smith,25,jane@example.com,Marketing',
      '3,Bob Johnson,35,bob@example.com,Engineering',
      '4,Alice Brown,28,alice@example.com,Sales',
      '5,Charlie Wilson,32,charlie@example.com,Marketing',
    ].join('\n');
    
    await fs.writeFile(testFilePath, csvContent);

    worker = new CSVProcessingWorker();
  });

  afterAll(async () => {
    await worker.close();
    
    // Cleanup test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default database mocks
    const mockDatabase = database as jest.Mocked<typeof database>;
    mockDatabase.query
      .mockResolvedValueOnce({ rows: [{ id: 'dataset-123' }], rowCount: 1 }) // Create dataset
      .mockResolvedValue({ rows: [], rowCount: 0 }); // Insert rows
  });

  describe('CSV file validation', () => {
    it('should validate file successfully', async () => {
      const stats = await fs.stat(testFilePath);
      
      // Create a job mock
      const jobMock = {
        id: 'test-job-1',
        data: {
          jobId: 'test-job-1',
          filePath: testFilePath,
          originalFilename: 'test.csv',
          fileSize: stats.size,
          mimeType: 'text/csv',
          userId: 'test-user',
          options: {
            hasHeaders: true,
            delimiter: ',',
            encoding: 'utf8',
            skipEmptyLines: true,
          },
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      };

      // This would normally be called by BullMQ
      const result = await (worker as any).processCSVJob(jobMock);
      
      expect(result).toBeDefined();
      expect(result.datasetId).toBeDefined();
      expect(result.stats.totalRows).toBe(5); // 5 data rows (excluding header)
      expect(result.columnSchema.length).toBe(5); // 5 columns
    });

    it('should handle invalid file path', async () => {
      const jobMock = {
        id: 'test-job-invalid',
        data: {
          jobId: 'test-job-invalid',
          filePath: '/invalid/path/file.csv',
          originalFilename: 'file.csv',
          fileSize: 1000,
          mimeType: 'text/csv',
          userId: 'test-user',
          options: {
            hasHeaders: true,
            delimiter: ',',
            encoding: 'utf8',
            skipEmptyLines: true,
          },
        },
        updateProgress: jest.fn(),
      };

      await expect((worker as any).processCSVJob(jobMock))
        .rejects.toThrow();
    });

    it('should handle file size mismatch', async () => {
      const jobMock = {
        id: 'test-job-size',
        data: {
          jobId: 'test-job-size',
          filePath: testFilePath,
          originalFilename: 'test.csv',
          fileSize: 99999, // Wrong size
          mimeType: 'text/csv',
          userId: 'test-user',
          options: {
            hasHeaders: true,
            delimiter: ',',
            encoding: 'utf8',
            skipEmptyLines: true,
          },
        },
        updateProgress: jest.fn(),
      };

      await expect((worker as any).processCSVJob(jobMock))
        .rejects.toThrow('File size mismatch');
    });
  });

  describe('CSV structure analysis', () => {
    it('should analyze CSV structure correctly', async () => {
      const options = {
        hasHeaders: true,
        delimiter: ',',
        encoding: 'utf8',
        skipEmptyLines: true,
      };

      const result = await (worker as any).analyzeCsvStructure(testFilePath, options);
      
      expect(result.columnSchema).toHaveLength(5);
      expect(result.estimatedRows).toBe(5); // 5 data rows
      
      const columns = result.columnSchema;
      expect(columns.find((c: any) => c.name === 'id')?.type).toBe('number');
      expect(columns.find((c: any) => c.name === 'name')?.type).toBe('string');
      expect(columns.find((c: any) => c.name === 'age')?.type).toBe('number');
      expect(columns.find((c: any) => c.name === 'email')?.type).toBe('string');
      expect(columns.find((c: any) => c.name === 'department')?.type).toBe('string');
    });

    it('should handle CSV without headers', async () => {
      // Create CSV without headers
      const noHeaderPath = path.join(testDir, 'no-header.csv');
      const csvContent = [
        '1,John Doe,30,john@example.com',
        '2,Jane Smith,25,jane@example.com',
      ].join('\n');
      
      await fs.writeFile(noHeaderPath, csvContent);

      const options = {
        hasHeaders: false,
        delimiter: ',',
        encoding: 'utf8',
        skipEmptyLines: true,
      };

      const result = await (worker as any).analyzeCsvStructure(noHeaderPath, options);
      
      expect(result.columnSchema).toHaveLength(4);
      expect(result.estimatedRows).toBe(2);

      // Cleanup
      await fs.unlink(noHeaderPath);
    });
  });

  describe('data type inference', () => {
    let testWorker: any;

    beforeAll(() => {
      testWorker = new CSVProcessingWorker();
    });

    it('should infer number type correctly', () => {
      const column = { name: 'test', type: 'string', nullable: false, samples: [] };
      
      testWorker.inferColumnType(column, '123');
      expect(column.type).toBe('number');
      
      testWorker.inferColumnType(column, '45.67');
      expect(column.type).toBe('number');
    });

    it('should infer boolean type correctly', () => {
      const column = { name: 'test', type: 'string', nullable: false, samples: [] };
      
      testWorker.inferColumnType(column, 'true');
      expect(column.type).toBe('boolean');
      
      testWorker.inferColumnType(column, '1');
      expect(column.type).toBe('boolean');
      
      testWorker.inferColumnType(column, 'yes');
      expect(column.type).toBe('boolean');
    });

    it('should infer date type correctly', () => {
      const column = { name: 'test', type: 'string', nullable: false, samples: [] };
      
      testWorker.inferColumnType(column, '2023-12-25');
      expect(column.type).toBe('date');
    });

    it('should handle null values', () => {
      const column = { name: 'test', type: 'string', nullable: false, samples: [] };
      
      testWorker.inferColumnType(column, null);
      expect(column.nullable).toBe(true);
      
      testWorker.inferColumnType(column, '');
      expect(column.nullable).toBe(true);
    });

    it('should default to string for mixed types', () => {
      const column = { name: 'test', type: 'number', nullable: false, samples: [] };
      
      testWorker.inferColumnType(column, 'not a number');
      expect(column.type).toBe('string');
    });
  });

  describe('database operations', () => {
    it('should create dataset record successfully', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockResolvedValueOnce({ 
        rows: [{ id: 'new-dataset-id' }], 
        rowCount: 1 
      });

      const columnSchema = [
        { name: 'id', type: 'number', nullable: false, samples: [1, 2, 3] },
        { name: 'name', type: 'string', nullable: false, samples: ['John', 'Jane'] },
      ];

      const datasetId = await (worker as any).createDatasetRecord(
        'job-123',
        'test.csv',
        1000,
        100,
        columnSchema,
        'user-456'
      );

      expect(datasetId).toBe('new-dataset-id');
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.datasets'),
        expect.arrayContaining(['job-123', 'test', 'test.csv', 100, 2, 1000])
      );
    });

    it('should update job status correctly', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const stats = {
        totalRows: 100,
        processedRows: 95,
        validRows: 93,
        invalidRows: 2,
        startTime: new Date(),
        processingSpeed: 1000,
        memoryUsage: 64,
      };

      await (worker as any).updateJobStatus('job-123', 'processing', 95, stats);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE jobs.upload_jobs'),
        expect.arrayContaining(['processing', 95, 95, 1000, null, 'job-123'])
      );
    });
  });

  describe('batch processing', () => {
    it('should process batch of data correctly', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockResolvedValueOnce({ rows: [], rowCount: 3 });

      const batch = [
        { id: 1, name: 'John', age: 30 },
        { id: 2, name: 'Jane', age: 25 },
        { id: 3, name: 'Bob', age: 35 },
      ];

      const stats = {
        totalRows: 0,
        processedRows: 0,
        validRows: 0,
        invalidRows: 0,
        startTime: new Date(),
        processingSpeed: 0,
        memoryUsage: 0,
      };

      await (worker as any).processBatch('dataset-123', batch, 0, stats);

      expect(stats.totalRows).toBe(3);
      expect(stats.validRows).toBe(3);
      expect(stats.processedRows).toBe(3);
      
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.dataset_rows'),
        expect.arrayContaining(['dataset-123'])
      );
    });

    it('should handle batch processing errors', async () => {
      const mockDatabase = database as jest.Mocked<typeof database>;
      mockDatabase.query.mockRejectedValueOnce(new Error('Database error'));

      const batch = [{ id: 1, name: 'John' }];
      const stats = {
        totalRows: 0,
        processedRows: 0,
        validRows: 0,
        invalidRows: 0,
        startTime: new Date(),
        processingSpeed: 0,
        memoryUsage: 0,
      };

      await expect(
        (worker as any).processBatch('dataset-123', batch, 0, stats)
      ).rejects.toThrow('Database error');

      expect(stats.invalidRows).toBe(1);
    });
  });

  describe('large file processing', () => {
    it('should handle large CSV files efficiently', async () => {
      // Create a larger test file
      const largeFilePath = path.join(testDir, 'large-test.csv');
      const lines = ['id,name,value'];
      
      // Generate 1000 rows
      for (let i = 1; i <= 1000; i++) {
        lines.push(`${i},User${i},${Math.random() * 1000}`);
      }
      
      await fs.writeFile(largeFilePath, lines.join('\n'));

      const jobMock = {
        id: 'large-job',
        data: {
          jobId: 'large-job',
          filePath: largeFilePath,
          originalFilename: 'large-test.csv',
          fileSize: (await fs.stat(largeFilePath)).size,
          mimeType: 'text/csv',
          userId: 'test-user',
          options: {
            hasHeaders: true,
            delimiter: ',',
            encoding: 'utf8',
            skipEmptyLines: true,
          },
        },
        updateProgress: jest.fn(),
      };

      const result = await (worker as any).processCSVJob(jobMock);
      
      expect(result.stats.totalRows).toBe(1000);
      expect(result.columnSchema.length).toBe(3);
      expect(jobMock.updateProgress).toHaveBeenCalledTimes(
        expect.any(Number)
      );

      // Cleanup
      await fs.unlink(largeFilePath);
    }, 30000); // Increase timeout for large file test
  });
});