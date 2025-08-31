import { DataValue, DataRow } from './data.types';

export type AggregationType = 'sum' | 'count' | 'average' | 'min' | 'max' | 'countDistinct' | 'median' | 'mode';

export interface PivotField {
  name: string;
  displayName?: string;
  type: 'dimension' | 'measure';
  aggregation?: AggregationType;
  format?: (value: DataValue) => string;
  sortDirection?: 'asc' | 'desc';
  showSubtotals?: boolean;
}

export interface PivotConfiguration {
  rows: PivotField[];
  columns: PivotField[];
  values: PivotField[];
  filters?: PivotField[];
  showGrandTotals?: boolean;
  showRowSubtotals?: boolean;
  showColumnSubtotals?: boolean;
  excludeEmptyRows?: boolean;
  excludeEmptyColumns?: boolean;
}

export interface PivotCell {
  value: DataValue;
  formattedValue?: string;
  rawValue?: DataValue;
  aggregationType?: AggregationType;
  contributingRows?: DataRow[];
  coordinates: {
    row: number;
    column: number;
  };
  metadata?: {
    isGrandTotal?: boolean;
    isSubtotal?: boolean;
    isHeader?: boolean;
    level?: number;
    parentPath?: string[];
  };
}

export interface PivotRow {
  cells: PivotCell[];
  level: number;
  isExpanded?: boolean;
  hasChildren?: boolean;
  parentPath: string[];
  key: string;
}

export interface PivotColumn {
  name: string;
  displayName?: string;
  width?: number;
  level: number;
  parentPath: string[];
  key: string;
  isExpanded?: boolean;
  hasChildren?: boolean;
}

export interface PivotTable {
  rows: PivotRow[];
  columns: PivotColumn[];
  data: PivotCell[][];
  metadata: {
    totalRows: number;
    totalColumns: number;
    configuration: PivotConfiguration;
    generatedAt: Date;
    processingTime: number;
  };
}

export interface PivotCalculation {
  field: string;
  formula: string;
  displayName?: string;
  dependencies: string[];
}

export interface DrillDownInfo {
  cell: PivotCell;
  filters: { field: string; value: DataValue }[];
  rawData: DataRow[];
}