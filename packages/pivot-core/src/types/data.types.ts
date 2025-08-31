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