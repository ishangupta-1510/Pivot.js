type DataValue = string | number | boolean | Date | null | undefined;
interface DataRow {
    [key: string]: DataValue;
}
type DataSet = DataRow[];
interface FieldInfo {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date';
    nullable: boolean;
    uniqueValues?: DataValue[];
    min?: number;
    max?: number;
}
interface DataSchema {
    fields: FieldInfo[];
    totalRows: number;
    estimatedSize: number;
}
interface DataValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    schema: DataSchema;
}
interface DataFilter {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn';
    value: DataValue | DataValue[];
}
interface DataSort {
    field: string;
    direction: 'asc' | 'desc';
    priority?: number;
}

type AggregationType = 'sum' | 'count' | 'average' | 'min' | 'max' | 'countDistinct' | 'median' | 'mode';
interface PivotField {
    name: string;
    displayName?: string;
    type: 'dimension' | 'measure';
    aggregation?: AggregationType;
    format?: (value: DataValue) => string;
    sortDirection?: 'asc' | 'desc';
    showSubtotals?: boolean;
}
interface PivotConfiguration {
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
interface PivotCell {
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
interface PivotRow {
    cells: PivotCell[];
    level: number;
    isExpanded?: boolean;
    hasChildren?: boolean;
    parentPath: string[];
    key: string;
}
interface PivotColumn {
    name: string;
    displayName?: string;
    width?: number;
    level: number;
    parentPath: string[];
    key: string;
    isExpanded?: boolean;
    hasChildren?: boolean;
}
interface PivotTable {
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
interface PivotCalculation {
    field: string;
    formula: string;
    displayName?: string;
    dependencies: string[];
}
interface DrillDownInfo {
    cell: PivotCell;
    filters: {
        field: string;
        value: DataValue;
    }[];
    rawData: DataRow[];
}

declare class DataAggregator {
    static aggregate(data: DataRow[], field: string, aggregationType: AggregationType): DataValue;
    static groupBy(data: DataRow[], fields: string[]): Map<string, DataRow[]>;
    static pivot(data: DataRow[], rowFields: string[], columnFields: string[], valueField: string, aggregationType: AggregationType): any;
    private static sum;
    private static average;
    private static min;
    private static max;
    private static median;
    private static mode;
    private static toNumber;
}

declare class DataFilterService {
    static filter(data: DataRow[], filters: DataFilter[]): DataRow[];
    static sort(data: DataRow[], sorts: DataSort[]): DataRow[];
    static search(data: DataRow[], searchTerm: string, fields?: string[]): DataRow[];
    private static matchesFilter;
    private static compareValues;
    static getUniqueValues(data: DataRow[], field: string): DataValue[];
    static getFieldStatistics(data: DataRow[], field: string): {
        count: number;
        nullCount: number;
        uniqueCount: number;
        min?: DataValue;
        max?: DataValue;
        average?: number;
    };
}

declare class DataTransformer {
    static normalizeData(data: DataRow[], schema: FieldInfo[]): DataRow[];
    static transformField(data: DataRow[], fieldName: string, transformer: (value: DataValue) => DataValue): DataRow[];
    static addCalculatedField(data: DataRow[], fieldName: string, calculator: (row: DataRow) => DataValue): DataRow[];
    static renameField(data: DataRow[], oldName: string, newName: string): DataRow[];
    static removeFields(data: DataRow[], fieldsToRemove: string[]): DataRow[];
    static selectFields(data: DataRow[], fieldsToKeep: string[]): DataRow[];
    static fillMissingValues(data: DataRow[], field: string, fillValue: DataValue | ((row: DataRow) => DataValue)): DataRow[];
    static removeDuplicates(data: DataRow[], keyFields?: string[]): DataRow[];
    static groupAndTransform(data: DataRow[], groupByFields: string[], transforms: {
        [key: string]: (group: DataRow[]) => DataValue;
    }): DataRow[];
    static pivotData(data: DataRow[], rowFields: string[], columnField: string, valueField: string, aggregator?: (values: DataValue[]) => DataValue): DataRow[];
    private static normalizeValue;
    private static getDefaultValue;
    private static parseValue;
}

declare class DataValidator {
    static validateDataset(data: DataRow[]): DataValidationResult;
    private static generateSchema;
    private static inferType;
    private static isValidDateString;
    private static resolvePrimaryType;
    private static validateAgainstSchema;
    private static estimateDataSize;
    private static estimateRowSize;
}

declare class PivotEngine {
    private config;
    private data;
    constructor(data: DataRow[], config: PivotConfiguration);
    generate(): PivotTable;
    private applyFilters;
    private buildHeaders;
    private buildDataMatrix;
    private getCellData;
    private createPivotCell;
    private buildPivotRows;
    private buildPivotColumns;
    private addGrandTotals;
    private addRowSubtotals;
    private addColumnSubtotals;
    private formatValue;
    updateConfiguration(config: Partial<PivotConfiguration>): void;
    updateData(data: DataRow[]): void;
}

export { type AggregationType, DataAggregator, type DataFilter, DataFilterService, type DataRow, type DataSchema, type DataSet, type DataSort, DataTransformer, type DataValidationResult, DataValidator, type DataValue, type DrillDownInfo, type FieldInfo, type PivotCalculation, type PivotCell, type PivotColumn, type PivotConfiguration, PivotEngine, type PivotField, type PivotRow, type PivotTable };
