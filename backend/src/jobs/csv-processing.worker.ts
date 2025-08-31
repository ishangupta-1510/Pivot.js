/**
 * CSV Processing Worker
 * Handles CSV file parsing, validation, and database insertion with streaming
 */

import { Worker, Job } from 'bullmq';
import { redis } from '@/config/redis';
import { database } from '@/config/database';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';
import { eventManager } from '@/services/event-manager';
import { issueLogger } from '@/services/issue-logger';
import { CSVProcessingJobData, JobProgress } from './queue-manager';
import csv from 'csv-parser';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';
import path from 'path';

interface ProcessingStats {
  totalRows: number;
  processedRows: number;
  validRows: number;
  invalidRows: number;
  startTime: Date;
  endTime?: Date;
  processingSpeed: number;
  memoryUsage: number;
}

interface ColumnInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'null';
  nullable: boolean;
  samples: any[];
}

class CSVProcessingWorker {
  private worker!: Worker;
  private eventManager = eventManager;
  private batchSize = 1000;
  private maxSampleSize = 100;

  constructor() {
    // EventManager is already initialized
    this.setupWorker();
  }

  // Validation helper methods
  private isValidDate(value: string): boolean {
    const date = new Date(value);
    return !isNaN(date.getTime()) && value.match(/^\d{4}-\d{2}-\d{2}/) !== null;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private setupWorker(): void {
    this.worker = new Worker(
      'csv-processing',
      this.processCSVJob.bind(this),
      {
        connection: redis.getClient(),
        concurrency: config.jobs.maxConcurrent,
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      }
    );

    this.worker.on('completed', (job) => {
      logger.info(`✅ CSV Processing job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`❌ CSV Processing job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (err) => {
      logger.error('💥 CSV Processing worker error:', err);
    });

    logger.info('👷 CSV Processing Worker initialized');
  }

  private async processCSVJob(job: Job<CSVProcessingJobData>): Promise<{
    datasetId: string;
    stats: ProcessingStats;
    columnSchema: ColumnInfo[];
  }> {
    const { jobId, filePath, originalFilename, fileSize, mimeType, userId, options } = job.data;
    
    logger.info(`🔄 Processing CSV job ${jobId}`, {
      filename: originalFilename,
      fileSize,
      userId,
    });

    // Update job status
    await this.updateJobStatus(jobId, 'processing', 0);

    try {
      // Step 1: Validate file
      await job.updateProgress({ 
        percentage: 5, 
        currentStep: 'Validating file',
        processedRows: 0 
      } as JobProgress);

      await this.validateFile(filePath, fileSize);

      // Step 2: Analyze CSV structure
      await job.updateProgress({
        percentage: 10,
        currentStep: 'Analyzing CSV structure',
        processedRows: 0
      } as JobProgress);

      const { columnSchema, estimatedRows } = await this.analyzeCsvStructure(filePath, options);

      // Step 3: Create dataset record
      await job.updateProgress({
        percentage: 15,
        currentStep: 'Creating dataset record',
        processedRows: 0
      } as JobProgress);

      const datasetId = await this.createDatasetRecord(
        jobId,
        originalFilename,
        fileSize,
        estimatedRows,
        columnSchema,
        userId
      );

      // Step 4: Process CSV data in batches
      await job.updateProgress({
        percentage: 20,
        currentStep: 'Processing CSV data',
        processedRows: 0,
        totalRows: estimatedRows
      } as JobProgress);

      const stats = await this.processCSVData(
        job,
        filePath,
        datasetId,
        columnSchema,
        options,
        estimatedRows
      );

      // Step 5: Finalize dataset
      await job.updateProgress({
        percentage: 95,
        currentStep: 'Finalizing dataset',
        processedRows: stats.processedRows,
        totalRows: stats.totalRows
      } as JobProgress);

      await this.finalizeDataset(datasetId, stats, columnSchema);

      // Cleanup temporary file
      try {
        await fs.unlink(filePath);
        logger.debug(`🗑️ Temporary file ${filePath} cleaned up`);
      } catch (error) {
        logger.warn(`Warning: Failed to cleanup temporary file ${filePath}:`, error);
      }

      await this.updateJobStatus(jobId, 'completed', 100, stats);

      await job.updateProgress({
        percentage: 100,
        currentStep: 'Processing complete',
        processedRows: stats.processedRows,
        totalRows: stats.totalRows,
        processingSpeed: stats.processingSpeed
      } as JobProgress);

      logger.info(`✅ CSV processing completed`, {
        jobId,
        datasetId,
        processedRows: stats.processedRows,
        processingTime: stats.endTime ? stats.endTime.getTime() - stats.startTime.getTime() : 0,
      });

      return {
        datasetId,
        stats,
        columnSchema,
      };

    } catch (error) {
      logger.error(`❌ CSV processing failed for job ${jobId}:`, error);
      
      await this.updateJobStatus(
        jobId, 
        'failed', 
        0, 
        undefined, 
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  }

  private async validateFile(filePath: string, expectedSize: number): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      if (stats.size !== expectedSize) {
        throw new Error(`File size mismatch. Expected: ${expectedSize}, Actual: ${stats.size}`);
      }

      if (stats.size > config.upload.maxFileSize) {
        throw new Error(`File size exceeds maximum allowed size: ${config.upload.maxFileSize}`);
      }

      logger.debug('✅ File validation passed', { filePath, size: stats.size });

    } catch (error) {
      logger.error('❌ File validation failed:', error);
      throw new Error(`File validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async analyzeCsvStructure(
    filePath: string, 
    options: CSVProcessingJobData['options']
  ): Promise<{ columnSchema: ColumnInfo[]; estimatedRows: number }> {
    
    return new Promise((resolve, reject) => {
      const columns: Map<string, ColumnInfo> = new Map();
      let totalRowCount = 0;
      let analysisRowCount = 0;
      let headerNames: string[] = [];
      let isFirstRow = true;
      let schemaAnalysisComplete = false;

      const stream = createReadStream(filePath)
        .pipe(csv({
          separator: options.delimiter,
          headers: false  // Always parse as raw data, handle headers manually
        }));

      stream.on('data', (row: any) => {
        totalRowCount++;
        
        // Handle headers if specified
        if (options.hasHeaders && isFirstRow) {
          isFirstRow = false;
          // Extract header names from first row
          headerNames = Object.values(row) as string[];
          logger.debug('Extracted headers:', headerNames);
          return; // Skip first row for analysis
        }
        
        // Convert row to use proper column names
        let processedRow: any;
        if (options.hasHeaders && headerNames.length > 0) {
          // Use extracted header names
          processedRow = {};
          Object.keys(row).forEach((key, index) => {
            const headerName = headerNames[index] || `Column_${index + 1}`;
            processedRow[headerName] = row[key];
          });
        } else {
          // Use original row if no headers
          processedRow = row;
        }

        // Analyze only first 1000 data rows for column schema (performance optimization)
        if (!schemaAnalysisComplete && analysisRowCount < 1000) {
          analysisRowCount++;
          Object.entries(processedRow).forEach(([key, value]) => {
            if (!columns.has(key)) {
              columns.set(key, {
                name: key,
                type: 'string',
                nullable: false,
                samples: [],
              });
            }

            const column = columns.get(key)!;
            
            // Update type inference
            this.inferColumnType(column, value);
            
            // Collect samples
            if (column.samples.length < this.maxSampleSize) {
              column.samples.push(value);
            }
          });
          
          if (analysisRowCount >= 1000) {
            schemaAnalysisComplete = true;
            logger.debug('Schema analysis complete, continuing row count...');
          }
        }

        // Continue counting all rows but log progress every 10K rows for large files
        if (totalRowCount % 10000 === 0) {
          logger.debug(`Row counting progress: ${totalRowCount.toLocaleString()} rows`);
        }
      });

      stream.on('end', () => {
        const columnSchema = Array.from(columns.values());
        
        // Use actual row count (subtract header if present)
        const actualDataRows = options.hasHeaders ? totalRowCount - 1 : totalRowCount;
        
        logger.info('📊 CSV structure analysis complete', {
          columns: columnSchema.length,
          totalRows: actualDataRows,
          analysisRows: analysisRowCount,
        });

        resolve({ columnSchema, estimatedRows: actualDataRows });
      });

      stream.on('error', (error) => {
        logger.error('❌ CSV analysis failed:', error);
        reject(new Error(`CSV analysis failed: ${error.message}`));
      });
    });
  }

  private inferColumnType(column: ColumnInfo, value: any): void {
    if (value === null || value === undefined || value === '') {
      column.nullable = true;
      return;
    }

    const strValue = String(value).trim();

    // Check for number
    if (!isNaN(Number(strValue)) && strValue !== '') {
      if (column.type === 'string') {
        column.type = 'number';
      }
    }
    // Check for boolean
    else if (['true', 'false', '1', '0', 'yes', 'no'].includes(strValue.toLowerCase())) {
      if (column.type === 'string' || column.type === 'number') {
        column.type = 'boolean';
      }
    }
    // Check for date
    else if (this.isDate(strValue)) {
      if (column.type === 'string') {
        column.type = 'date';
      }
    }
    // Default to string if mixed types
    else if (column.type !== 'string') {
      column.type = 'string';
    }
  }

  private isDate(value: string): boolean {
    const date = new Date(value);
    return !isNaN(date.getTime()) && value.match(/^\d{4}-\d{2}-\d{2}/) !== null;
  }

  private async createDatasetRecord(
    jobId: string,
    filename: string,
    fileSize: number,
    estimatedRows: number,
    columnSchema: ColumnInfo[],
    userId?: string
  ): Promise<string> {
    
    const id = crypto.randomUUID();
    
    const query = `
      INSERT INTO public.datasets (
        id, job_id, name, original_filename, total_rows, total_columns,
        file_size, column_schema, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const values = [
      id,
      jobId,
      path.parse(filename).name,
      filename,
      estimatedRows,
      columnSchema.length,
      fileSize,
      JSON.stringify(columnSchema),
      'processing',
      userId || 'system',
    ];

    const result = await database.query(query, values);
    
    logger.info('📝 Dataset record created', {
      datasetId: id,
      filename,
      columns: columnSchema.length,
      estimatedRows,
    });

    return result.rows[0].id;
  }

  private async processCSVData(
    job: Job<CSVProcessingJobData>,
    filePath: string,
    datasetId: string,
    columnSchema: ColumnInfo[],
    options: CSVProcessingJobData['options'],
    estimatedRows: number
  ): Promise<ProcessingStats> {
    
    const stats: ProcessingStats = {
      totalRows: 0,
      processedRows: 0,
      validRows: 0,
      invalidRows: 0,
      startTime: new Date(),
      processingSpeed: 0,
      memoryUsage: 0,
    };

    let batch: any[] = [];
    let batchIndex = 0;
    let headerNames: string[] = [];
    let isFirstRow = true;

    const batchProcessor = new Transform({
      objectMode: true,
      transform: (chunk, encoding, callback) => {
        // Handle headers if specified
        if (options.hasHeaders && isFirstRow) {
          isFirstRow = false;
          // Extract header names from first row
          headerNames = Object.values(chunk) as string[];
          console.log('Data processing - Extracted headers:', headerNames);
          callback(); // Skip first row for processing
          return;
        }
        
        // Convert row to use proper column names
        let processedChunk = chunk;
        if (options.hasHeaders && headerNames.length > 0) {
          processedChunk = {};
          Object.keys(chunk).forEach((key, index) => {
            const headerName = headerNames[index] || `Column_${index + 1}`;
            processedChunk[headerName] = chunk[key];
          });
        }
        
        batch.push(processedChunk);
        
        if (batch.length >= this.batchSize) {
          this.processBatch(datasetId, batch, batchIndex++, stats, job.data.jobId)
            .then(() => {
              // Update progress
              const percentage = Math.min(85, 20 + (stats.processedRows / estimatedRows) * 65);
              const elapsed = Date.now() - stats.startTime.getTime();
              const speed = elapsed > 0 ? Math.round((stats.processedRows / elapsed) * 1000) : 0;
              
              job.updateProgress({
                percentage,
                currentStep: `Processing batch ${batchIndex}`,
                processedRows: stats.processedRows,
                totalRows: estimatedRows,
                processingSpeed: speed,
              } as JobProgress);

              batch = [];
              callback();
            })
            .catch(callback);
        } else {
          callback();
        }
      },
      flush: (callback) => {
        if (batch.length > 0) {
          this.processBatch(datasetId, batch, batchIndex++, stats, job.data.jobId)
            .then(() => callback())
            .catch(callback);
        } else {
          callback();
        }
      },
    });

    try {
      const stream = createReadStream(filePath)
        .pipe(csv({
          separator: options.delimiter,
          headers: false  // Always parse as raw data, handle headers manually
        }));

      await pipeline(stream, batchProcessor);

      stats.endTime = new Date();
      const processingTime = stats.endTime.getTime() - stats.startTime.getTime();
      stats.processingSpeed = processingTime > 0 ? Math.round((stats.processedRows / processingTime) * 1000) : 0;

      // Flush any remaining issues to database
      await issueLogger.flush();

      logger.info('📊 CSV data processing complete', {
        datasetId,
        totalRows: stats.totalRows,
        validRows: stats.validRows,
        invalidRows: stats.invalidRows,
        processingTime,
        speed: stats.processingSpeed,
      });

      return stats;

    } catch (error) {
      logger.error('❌ CSV data processing failed:', error);
      throw error;
    }
  }

  private async processBatch(
    datasetId: string,
    batch: any[],
    batchIndex: number,
    stats: ProcessingStats,
    jobId?: string
  ): Promise<void> {
    
    const startTime = Date.now();
    
    try {
      const values: string[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const [index, row] of batch.entries()) {
        const rowIndex = (batchIndex * this.batchSize) + index + 1; // 1-indexed for user-friendly display
        
        // Validate row data
        for (const [columnName, cellValue] of Object.entries(row)) {
          // Check for missing values
          if (cellValue === null || cellValue === undefined || cellValue === '') {
            await issueLogger.logMissingValue(
              datasetId,
              rowIndex,
              columnName,
              jobId,
              batchIndex
            );
          }
          
          // Check for type issues (example validation)
          if (columnName.toLowerCase().includes('date')) {
            const dateValue = String(cellValue);
            if (dateValue && !this.isValidDate(dateValue)) {
              await issueLogger.logTypeMismatch(
                datasetId,
                rowIndex,
                columnName,
                'date',
                dateValue,
                jobId,
                batchIndex
              );
            }
          }
          
          // Check for numeric columns
          if (columnName.toLowerCase().includes('amount') || columnName.toLowerCase().includes('price') || columnName.toLowerCase().includes('quantity')) {
            const numValue = String(cellValue);
            if (numValue && isNaN(Number(numValue))) {
              await issueLogger.logTypeMismatch(
                datasetId,
                rowIndex,
                columnName,
                'number',
                numValue,
                jobId,
                batchIndex
              );
            }
          }
          
          // Check for email validation
          if (columnName.toLowerCase().includes('email')) {
            const emailValue = String(cellValue);
            if (emailValue && !this.isValidEmail(emailValue)) {
              await issueLogger.logValidationError(
                datasetId,
                rowIndex,
                columnName,
                emailValue,
                'Invalid email format',
                jobId,
                batchIndex
              );
            }
          }
        }
        
        const dataHash = crypto.createHash('md5').update(JSON.stringify(row)).digest('hex');
        
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
        values.push(datasetId, String(rowIndex - 1), JSON.stringify(row), dataHash); // Store as 0-indexed in DB
        paramIndex += 4;
        
        stats.totalRows++;
        stats.validRows++;
      }

      const query = `
        INSERT INTO public.dataset_rows (dataset_id, row_index, data, data_hash)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (dataset_id, row_index) DO NOTHING
      `;

      await database.query(query, values);
      
      stats.processedRows += batch.length;
      stats.memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

      const batchTime = Date.now() - startTime;
      logger.debug(`📦 Batch ${batchIndex} processed`, {
        rows: batch.length,
        time: batchTime,
        totalProcessed: stats.processedRows,
      });

    } catch (error: any) {
      stats.invalidRows += batch.length;
      logger.error(`❌ Batch ${batchIndex} processing failed:`, error);
      
      // Log system error for batch processing failure
      await issueLogger.logSystemError(
        datasetId,
        `Batch ${batchIndex} processing failed: ${error.message}`,
        error,
        jobId
      );
      
      throw error;
    }
  }

  private async finalizeDataset(
    datasetId: string,
    stats: ProcessingStats,
    columnSchema: ColumnInfo[]
  ): Promise<void> {
    
    const processingStats = {
      totalRows: stats.totalRows,
      validRows: stats.validRows,
      invalidRows: stats.invalidRows,
      processingTime: stats.endTime ? stats.endTime.getTime() - stats.startTime.getTime() : 0,
      processingSpeed: stats.processingSpeed,
      memoryUsage: stats.memoryUsage,
    };

    const query = `
      UPDATE public.datasets 
      SET 
        total_rows = $1,
        status = $2,
        processing_stats = $3,
        column_schema = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `;

    const values = [
      stats.validRows,
      'active',
      JSON.stringify(processingStats),
      JSON.stringify(columnSchema),
      datasetId,
    ];

    await database.query(query, values);
    
    logger.info('✅ Dataset finalized', {
      datasetId,
      totalRows: stats.validRows,
      status: 'active',
    });
  }

  private async updateJobStatus(
    jobId: string,
    status: string,
    progress: number,
    stats?: ProcessingStats,
    errorMessage?: string
  ): Promise<void> {
    
    const query = `
      UPDATE jobs.upload_jobs 
      SET 
        status = $1::text,
        progress_percentage = $2,
        rows_processed = $3,
        processing_speed_rows_per_sec = $4,
        error_message = $5,
        updated_at = CURRENT_TIMESTAMP,
        completed_at = CASE WHEN $1::text IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = $6::uuid
    `;

    const values = [
      status,
      progress,
      stats?.processedRows || 0,
      stats?.processingSpeed || null,
      errorMessage || null,
      jobId,
    ];

    await database.query(query, values);

    // Emit event for real-time updates
    this.eventManager.emit('job:status_updated', {
      jobId,
      status,
      progress,
      stats,
      error: errorMessage,
    });
  }

  public getWorker(): Worker {
    return this.worker;
  }

  public async close(): Promise<void> {
    await this.worker.close();
    logger.info('🔌 CSV Processing Worker closed');
  }
}

export default CSVProcessingWorker;