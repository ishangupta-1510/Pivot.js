export type DataValue = string | number | boolean | Date | null | undefined;

export interface DataRow {
  [key: string]: DataValue;
}

export type DataSet = DataRow[];

export interface FieldInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  nullable: boolean;
  uniqueValues?: DataValue[];
  min?: number;
  max?: number;
}

export interface DataSchema {
  fields: FieldInfo[];
  totalRows: number;
  estimatedSize: number;
}

export interface DataValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  schema: DataSchema;
}

export interface StreamingParserOptions {
  chunkSize?: number;
  maxRows?: number;
  sampleRate?: number;
  delimiter?: string;
  hasHeader?: boolean;
  skipEmptyLines?: boolean;
  onProgress?: (info: ProgressInfo) => void;
  onError?: (error: Error) => void;
}

export interface ProgressInfo {
  bytesProcessed: number;
  totalBytes: number;
  rowsProcessed: number;
  estimatedRowsTotal?: number;
  percentage: number;
  memoryUsage?: number;
  processingSpeed?: number;
}

export interface DataFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn';
  value: DataValue | DataValue[];
}

export interface DataSort {
  field: string;
  direction: 'asc' | 'desc';
  priority?: number;
}