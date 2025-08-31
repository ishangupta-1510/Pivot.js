/**
 * Issue Logger Service
 * Handles logging of errors, warnings, and info messages during dataset processing
 */

import { database } from '@/config/database';
import { logger } from '@/utils/logger';

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueCategory = 
  | 'data_validation'
  | 'type_mismatch'
  | 'format_error'
  | 'missing_value'
  | 'duplicate_value'
  | 'constraint_violation'
  | 'parsing_error'
  | 'calculation_error'
  | 'system_error'
  | 'other';

export interface IssueDetails {
  datasetId: string;
  jobId?: string;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  code?: string;
  rowNumber?: number;
  columnName?: string;
  cellValue?: string;
  batchNumber?: number;
  details?: Record<string, any>;
}

export class IssueLogger {
  private static instance: IssueLogger;
  private batchedIssues: IssueDetails[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private maxBatchSize = 100;
  private flushIntervalMs = 5000;

  private constructor() {
    this.startBatchTimer();
  }

  public static getInstance(): IssueLogger {
    if (!IssueLogger.instance) {
      IssueLogger.instance = new IssueLogger();
    }
    return IssueLogger.instance;
  }

  /**
   * Log a single issue
   */
  public async logIssue(issue: IssueDetails): Promise<void> {
    this.batchedIssues.push(issue);

    // Flush if batch is full
    if (this.batchedIssues.length >= this.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Log multiple issues at once
   */
  public async logIssues(issues: IssueDetails[]): Promise<void> {
    this.batchedIssues.push(...issues);

    // Flush if batch is full
    if (this.batchedIssues.length >= this.maxBatchSize) {
      await this.flush();
    }
  }

  /**
   * Log a data validation error
   */
  public async logValidationError(
    datasetId: string,
    rowNumber: number,
    columnName: string,
    cellValue: string,
    message: string,
    jobId?: string,
    batchNumber?: number
  ): Promise<void> {
    await this.logIssue({
      datasetId,
      jobId,
      severity: 'error',
      category: 'data_validation',
      message,
      rowNumber,
      columnName,
      cellValue,
      batchNumber,
      code: 'VAL_001',
    });
  }

  /**
   * Log a type mismatch warning
   */
  public async logTypeMismatch(
    datasetId: string,
    rowNumber: number,
    columnName: string,
    expectedType: string,
    actualValue: string,
    jobId?: string,
    batchNumber?: number
  ): Promise<void> {
    await this.logIssue({
      datasetId,
      jobId,
      severity: 'warning',
      category: 'type_mismatch',
      message: `Expected ${expectedType} but got "${actualValue}" in column ${columnName}`,
      rowNumber,
      columnName,
      cellValue: actualValue,
      batchNumber,
      code: 'TYPE_001',
      details: { expectedType, actualValue },
    });
  }

  /**
   * Log a missing value warning
   */
  public async logMissingValue(
    datasetId: string,
    rowNumber: number,
    columnName: string,
    jobId?: string,
    batchNumber?: number
  ): Promise<void> {
    await this.logIssue({
      datasetId,
      jobId,
      severity: 'warning',
      category: 'missing_value',
      message: `Missing value in required column ${columnName}`,
      rowNumber,
      columnName,
      batchNumber,
      code: 'MISS_001',
    });
  }

  /**
   * Log a parsing error
   */
  public async logParsingError(
    datasetId: string,
    rowNumber: number,
    message: string,
    rawData?: string,
    jobId?: string,
    batchNumber?: number
  ): Promise<void> {
    await this.logIssue({
      datasetId,
      jobId,
      severity: 'error',
      category: 'parsing_error',
      message,
      rowNumber,
      batchNumber,
      code: 'PARSE_001',
      details: { rawData },
    });
  }

  /**
   * Log a system error
   */
  public async logSystemError(
    datasetId: string,
    message: string,
    error: Error,
    jobId?: string
  ): Promise<void> {
    await this.logIssue({
      datasetId,
      jobId,
      severity: 'error',
      category: 'system_error',
      message,
      code: 'SYS_001',
      details: {
        errorMessage: error.message,
        errorStack: error.stack,
      },
    });
  }

  /**
   * Flush batched issues to database
   */
  public async flush(): Promise<void> {
    if (this.batchedIssues.length === 0) {
      return;
    }

    const issuesToFlush = [...this.batchedIssues];
    this.batchedIssues = [];

    try {
      // Build bulk insert query
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const issue of issuesToFlush) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, ` +
          `$${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );

        values.push(
          issue.datasetId,
          issue.jobId || null,
          issue.severity,
          issue.category,
          issue.code || null,
          issue.message,
          issue.details ? JSON.stringify(issue.details) : null,
          issue.rowNumber || null,
          issue.columnName || null,
          issue.cellValue ? issue.cellValue.substring(0, 1000) : null,
          issue.batchNumber || null,
          new Date()
        );
      }

      const query = `
        INSERT INTO public.dataset_issues (
          dataset_id, job_id, severity, category, code, message,
          details, row_number, column_name, cell_value, batch_number, occurred_at
        ) VALUES ${placeholders.join(', ')}
      `;

      await database.query(query, values);

      logger.debug(`Flushed ${issuesToFlush.length} issues to database`);
    } catch (error) {
      logger.error('Failed to flush issues to database:', error);
      // Re-add issues to batch for retry
      this.batchedIssues.unshift(...issuesToFlush);
    }
  }

  /**
   * Start the batch timer
   */
  private startBatchTimer(): void {
    if (this.flushInterval) {
      return;
    }

    this.flushInterval = setInterval(async () => {
      await this.flush();
    }, this.flushIntervalMs);
  }

  /**
   * Stop the batch timer and flush remaining issues
   */
  public async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flush();
  }

  /**
   * Get issue statistics for a dataset
   */
  public async getDatasetIssueStats(datasetId: string): Promise<{
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    unresolvedCount: number;
    resolvedCount: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) AS total_issues,
        COUNT(*) FILTER (WHERE severity = 'error') AS error_count,
        COUNT(*) FILTER (WHERE severity = 'warning') AS warning_count,
        COUNT(*) FILTER (WHERE severity = 'info') AS info_count,
        COUNT(*) FILTER (WHERE is_resolved = FALSE) AS unresolved_count,
        COUNT(*) FILTER (WHERE is_resolved = TRUE) AS resolved_count
      FROM public.dataset_issues
      WHERE dataset_id = $1
    `;

    const result = await database.query(query, [datasetId]);
    const stats = result.rows[0];

    return {
      totalIssues: parseInt(stats.total_issues) || 0,
      errorCount: parseInt(stats.error_count) || 0,
      warningCount: parseInt(stats.warning_count) || 0,
      infoCount: parseInt(stats.info_count) || 0,
      unresolvedCount: parseInt(stats.unresolved_count) || 0,
      resolvedCount: parseInt(stats.resolved_count) || 0,
    };
  }

  /**
   * Get detailed issues for a dataset
   */
  public async getDatasetIssues(
    datasetId: string,
    severity?: IssueSeverity,
    category?: IssueCategory,
    limit = 100,
    offset = 0
  ): Promise<any[]> {
    let query = `
      SELECT * FROM public.dataset_issues
      WHERE dataset_id = $1
    `;
    const values: any[] = [datasetId];
    let paramIndex = 2;

    if (severity) {
      query += ` AND severity = $${paramIndex++}`;
      values.push(severity);
    }

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      values.push(category);
    }

    query += ` ORDER BY occurred_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    values.push(limit, offset);

    const result = await database.query(query, values);
    return result.rows;
  }
}

export const issueLogger = IssueLogger.getInstance();