/**
 * Upload Controller
 * Handles file upload, validation, and CSV processing job creation
 */

import { Request, Response, NextFunction } from 'express';
import { queueManager } from '@/jobs/queue-manager';
import { database } from '@/config/database';
import { config } from '@/config/environment';
import { logger, logError, logAudit } from '@/utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import mime from 'mime-types';

// Configure multer for file uploads
const uploadDir = path.resolve(config.upload.directory);

// Ensure upload directory exists
fs.mkdir(uploadDir, { recursive: true }).catch((error) => {
  logger.error('Failed to create upload directory:', error);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const extension = path.extname(file.originalname);
    cb(null, `upload-${uniqueSuffix}${extension}`);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = config.upload.allowedMimeTypes;
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 1,
  },
});

export class UploadController {
  /**
   * Upload CSV file and create processing job
   */
  public static async uploadCSV(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded',
          code: 'MISSING_FILE',
        });
        return;
      }

      // Validate file
      const validation = await UploadController.validateUploadedFile(file);
      if (!validation.valid) {
        // Cleanup file
        await fs.unlink(file.path).catch(() => {});
        
        res.status(400).json({
          success: false,
          error: validation.error,
          code: 'INVALID_FILE',
        });
        return;
      }

      // Extract processing options from request
      const options = {
        hasHeaders: req.body.hasHeaders === 'true' || req.body.hasHeaders === true,
        delimiter: req.body.delimiter || ',',
        encoding: req.body.encoding || 'utf8',
        skipEmptyLines: req.body.skipEmptyLines === 'true' || req.body.skipEmptyLines === true,
        maxRows: req.body.maxRows ? parseInt(req.body.maxRows) : undefined,
      };

      // Create upload job record
      const jobId = crypto.randomUUID();
      const userId = (req as any).user?.id || 'anonymous';
      
      await UploadController.createUploadJobRecord({
        jobId,
        originalFilename: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        userId,
      });

      // Add job to processing queue
      const job = await queueManager.addCSVProcessingJob({
        jobId,
        filePath: file.path,
        originalFilename: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        userId,
        options,
      });

      // Log audit event
      logAudit('file_uploaded', 'csv', userId, {
        filename: file.originalname,
        fileSize: file.size,
        jobId,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId,
          queueJobId: job.id,
          filename: file.originalname,
          fileSize: file.size,
          status: 'queued',
          options,
          estimatedProcessingTime: UploadController.estimateProcessingTime(file.size),
        },
        message: 'File uploaded successfully and queued for processing',
      });

    } catch (error) {
      logError(error, 'uploadCSV');
      
      // Cleanup file if it exists
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error during file upload',
        code: 'UPLOAD_ERROR',
      });
    }
  }

  /**
   * Get upload job status
   */
  public static async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;

      if (!jobId) {
        res.status(400).json({
          success: false,
          error: 'Job ID is required',
          code: 'MISSING_JOB_ID',
        });
        return;
      }

      // Get job status from database
      const query = `
        SELECT 
          uj.*,
          d.id as dataset_id,
          d.name as dataset_name,
          d.status as dataset_status
        FROM jobs.upload_jobs uj
        LEFT JOIN public.datasets d ON d.job_id = uj.id
        WHERE uj.id = $1
      `;

      const result = await database.query(query, [jobId]);
      
      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
        return;
      }

      const job = result.rows[0];

      // Get BullMQ job status if available
      let queueJobStatus = null;
      try {
        const queueJob = await queueManager.getJob('csv-processing', `csv-processing-process-csv-${job.created_at}`);
        if (queueJob) {
          queueJobStatus = {
            id: queueJob.id,
            progress: queueJob.progress,
            state: await queueJob.getState(),
            processedOn: queueJob.processedOn,
            finishedOn: queueJob.finishedOn,
          };
        }
      } catch (error) {
        logger.warn('Failed to get queue job status:', error);
      }

      res.json({
        success: true,
        data: {
          jobId: job.id,
          status: job.status,
          progress: job.progress_percentage,
          filename: job.original_filename,
          fileSize: job.file_size,
          rowsProcessed: job.rows_processed,
          totalRowsEstimated: job.total_rows_estimated,
          processingSpeed: job.processing_speed_rows_per_sec,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          estimatedCompletionAt: job.estimated_completion_at,
          error: job.error_message,
          errorDetails: job.error_details,
          retryCount: job.retry_count,
          dataset: job.dataset_id ? {
            id: job.dataset_id,
            name: job.dataset_name,
            status: job.dataset_status,
          } : null,
          queueJob: queueJobStatus,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        },
      });

    } catch (error) {
      logError(error, 'getJobStatus');
      res.status(500).json({
        success: false,
        error: 'Failed to get job status',
        code: 'STATUS_ERROR',
      });
    }
  }

  /**
   * Get all upload jobs for user
   */
  public static async getUploadJobs(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      const { status, limit = 50, offset = 0 } = req.query;

      let query = `
        SELECT 
          uj.*,
          d.id as dataset_id,
          d.name as dataset_name,
          d.status as dataset_status,
          d.total_rows as dataset_total_rows
        FROM jobs.upload_jobs uj
        LEFT JOIN public.datasets d ON d.job_id = uj.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (userId && userId !== 'anonymous') {
        query += ` AND uj.created_by = $${params.length + 1}`;
        params.push(userId);
      }

      if (status) {
        query += ` AND uj.status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY uj.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await database.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM jobs.upload_jobs WHERE 1=1';
      const countParams: any[] = [];

      if (userId && userId !== 'anonymous') {
        countQuery += ` AND created_by = $${countParams.length + 1}`;
        countParams.push(userId);
      }

      if (status) {
        countQuery += ` AND status = $${countParams.length + 1}`;
        countParams.push(status);
      }

      const countResult = await database.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: {
          jobs: result.rows.map(job => ({
            jobId: job.id,
            status: job.status,
            progress: job.progress_percentage,
            filename: job.original_filename,
            fileSize: job.file_size,
            rowsProcessed: job.rows_processed,
            totalRowsEstimated: job.total_rows_estimated,
            startedAt: job.started_at,
            completedAt: job.completed_at,
            error: job.error_message,
            dataset: job.dataset_id ? {
              id: job.dataset_id,
              name: job.dataset_name,
              status: job.dataset_status,
              totalRows: job.dataset_total_rows,
            } : null,
            createdAt: job.created_at,
            updatedAt: job.updated_at,
          })),
          pagination: {
            total,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            hasMore: (parseInt(offset as string) + parseInt(limit as string)) < total,
          },
        },
      });

    } catch (error) {
      logError(error, 'getUploadJobs');
      res.status(500).json({
        success: false,
        error: 'Failed to get upload jobs',
        code: 'JOBS_ERROR',
      });
    }
  }

  /**
   * Retry failed job
   */
  public static async retryJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;

      // Get job details
      const query = 'SELECT * FROM jobs.upload_jobs WHERE id = $1';
      const result = await database.query(query, [jobId]);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
        return;
      }

      const job = result.rows[0];

      if (job.status !== 'failed') {
        res.status(400).json({
          success: false,
          error: 'Only failed jobs can be retried',
          code: 'INVALID_STATUS',
        });
        return;
      }

      if (job.retry_count >= job.max_retries) {
        res.status(400).json({
          success: false,
          error: 'Maximum retry attempts exceeded',
          code: 'MAX_RETRIES_EXCEEDED',
        });
        return;
      }

      // Update retry count and status
      const updateQuery = `
        UPDATE jobs.upload_jobs 
        SET 
          status = 'pending',
          retry_count = retry_count + 1,
          error_message = NULL,
          error_details = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await database.query(updateQuery, [jobId]);

      // Re-queue job
      const newJob = await queueManager.addCSVProcessingJob({
        jobId,
        filePath: job.file_path,
        originalFilename: job.original_filename,
        fileSize: job.file_size,
        mimeType: job.mime_type,
        userId: job.created_by,
        options: {
          hasHeaders: true, // Default, could be stored in job details
          delimiter: ',',
          encoding: 'utf8',
          skipEmptyLines: true,
        },
      });

      logAudit('job_retried', 'upload_job', job.created_by, {
        jobId,
        retryCount: job.retry_count + 1,
      });

      res.json({
        success: true,
        data: {
          jobId,
          queueJobId: newJob.id,
          retryCount: job.retry_count + 1,
          status: 'pending',
        },
        message: 'Job queued for retry',
      });

    } catch (error) {
      logError(error, 'retryJob');
      res.status(500).json({
        success: false,
        error: 'Failed to retry job',
        code: 'RETRY_ERROR',
      });
    }
  }

  /**
   * Cancel pending job
   */
  public static async cancelJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;

      // Get job details
      const query = 'SELECT * FROM jobs.upload_jobs WHERE id = $1';
      const result = await database.query(query, [jobId]);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
        return;
      }

      const job = result.rows[0];

      if (!['pending', 'processing'].includes(job.status)) {
        res.status(400).json({
          success: false,
          error: 'Only pending or processing jobs can be cancelled',
          code: 'INVALID_STATUS',
        });
        return;
      }

      // Update job status
      const updateQuery = `
        UPDATE jobs.upload_jobs 
        SET 
          status = 'cancelled',
          error_message = 'Job cancelled by user',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await database.query(updateQuery, [jobId]);

      // Cleanup file if it exists
      if (job.file_path) {
        await fs.unlink(job.file_path).catch(() => {});
      }

      logAudit('job_cancelled', 'upload_job', job.created_by, { jobId });

      res.json({
        success: true,
        data: { jobId, status: 'cancelled' },
        message: 'Job cancelled successfully',
      });

    } catch (error) {
      logError(error, 'cancelJob');
      res.status(500).json({
        success: false,
        error: 'Failed to cancel job',
        code: 'CANCEL_ERROR',
      });
    }
  }

  // Helper methods

  private static async validateUploadedFile(file: Express.Multer.File): Promise<{
    valid: boolean;
    error?: string;
  }> {
    try {
      // Check file size
      if (file.size > config.upload.maxFileSize) {
        return {
          valid: false,
          error: `File size exceeds maximum allowed size of ${config.upload.maxFileSize} bytes`,
        };
      }

      // Check MIME type
      const detectedMimeType = mime.lookup(file.originalname);
      if (detectedMimeType && !config.upload.allowedMimeTypes.includes(detectedMimeType)) {
        return {
          valid: false,
          error: `File type not allowed. Allowed types: ${config.upload.allowedMimeTypes.join(', ')}`,
        };
      }

      // Check if file exists and is readable
      await fs.access(file.path);
      const stats = await fs.stat(file.path);
      
      if (!stats.isFile()) {
        return {
          valid: false,
          error: 'Uploaded path is not a file',
        };
      }

      return { valid: true };

    } catch (error) {
      return {
        valid: false,
        error: `File validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private static async createUploadJobRecord(data: {
    jobId: string;
    originalFilename: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    userId: string;
  }): Promise<void> {
    const fileHash = crypto.createHash('sha256')
      .update(data.originalFilename + data.fileSize + Date.now())
      .digest('hex');

    const query = `
      INSERT INTO jobs.upload_jobs (
        id, original_filename, file_size, mime_type, file_path, file_hash, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const values = [
      data.jobId,
      data.originalFilename,
      data.fileSize,
      data.mimeType,
      data.filePath,
      fileHash,
      data.userId,
    ];

    await database.query(query, values);
  }

  private static estimateProcessingTime(fileSize: number): number {
    // Rough estimate: 1MB per 2 seconds
    const estimatedSeconds = Math.max(5, Math.round(fileSize / (1024 * 1024)) * 2);
    return estimatedSeconds;
  }
}

// Export multer middleware
export const uploadMiddleware = upload.single('file');