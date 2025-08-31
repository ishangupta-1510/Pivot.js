import { PivotTable } from './pivot.types';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'json' | 'html' | 'png' | 'svg';

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  includeHeaders: boolean;
  includeFormatting: boolean;
  includeSubtotals: boolean;
  includeGrandTotals: boolean;
  selectedOnly: boolean;
  customFields?: string[];
}

export interface CSVExportOptions extends ExportOptions {
  format: 'csv';
  delimiter: string;
  encoding: 'utf-8' | 'utf-16' | 'ascii';
  includeMetadata: boolean;
}

export interface ExcelExportOptions extends ExportOptions {
  format: 'xlsx';
  sheetName: string;
  includeCharts: boolean;
  includeConditionalFormatting: boolean;
  freezePanes: boolean;
  autoFilter: boolean;
}

export interface PDFExportOptions extends ExportOptions {
  format: 'pdf';
  pageSize: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  includeHeader: boolean;
  includeFooter: boolean;
  fontSize: number;
}

export interface ImageExportOptions extends ExportOptions {
  format: 'png' | 'svg';
  width: number;
  height: number;
  scale: number;
  backgroundColor: string;
  includeTitle: boolean;
}

export interface ExportProgress {
  stage: 'preparing' | 'processing' | 'formatting' | 'generating' | 'complete';
  percentage: number;
  message: string;
  estimatedTimeRemaining?: number;
}

export interface ExportResult {
  success: boolean;
  data?: Blob | string;
  filename?: string;
  size?: number;
  error?: string;
  metadata?: {
    rowsExported: number;
    columnsExported: number;
    processingTime: number;
    fileSize: number;
  };
}

export interface ExportService {
  export(data: PivotTable, options: ExportOptions): Promise<ExportResult>;
  getSupportedFormats(): ExportFormat[];
  validateOptions(options: ExportOptions): { valid: boolean; errors: string[] };
}