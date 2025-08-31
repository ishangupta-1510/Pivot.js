import { DataRow, DataValue, FieldInfo, DataSchema, DataValidationResult } from './types/data.types';

export class DataValidator {
  static validateDataset(data: DataRow[]): DataValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data || !Array.isArray(data)) {
      errors.push('Data must be an array');
      return {
        isValid: false,
        errors,
        warnings,
        schema: { fields: [], totalRows: 0, estimatedSize: 0 }
      };
    }

    if (data.length === 0) {
      warnings.push('Dataset is empty');
    }

    const schema = this.generateSchema(data);
    const validation = this.validateAgainstSchema(data, schema);

    return {
      isValid: errors.length === 0 && validation.errors.length === 0,
      errors: [...errors, ...validation.errors],
      warnings: [...warnings, ...validation.warnings],
      schema
    };
  }

  private static generateSchema(data: DataRow[]): DataSchema {
    if (data.length === 0) {
      return { fields: [], totalRows: 0, estimatedSize: 0 };
    }

    const fields: FieldInfo[] = [];
    const fieldMap = new Map<string, {
      types: Set<string>;
      nullable: boolean;
      values: Set<DataValue>;
      numericValues: number[];
    }>();

    data.forEach((row, index) => {
      if (index >= 1000) return; // Sample first 1000 rows for schema generation

      Object.keys(row).forEach(key => {
        if (!fieldMap.has(key)) {
          fieldMap.set(key, {
            types: new Set(),
            nullable: false,
            values: new Set(),
            numericValues: []
          });
        }

        const fieldInfo = fieldMap.get(key)!;
        const value = row[key];

        if (value === null || value === undefined) {
          fieldInfo.nullable = true;
          fieldInfo.types.add('null');
        } else {
          fieldInfo.values.add(value);
          const type = this.inferType(value);
          fieldInfo.types.add(type);

          if (type === 'number' && typeof value === 'number') {
            fieldInfo.numericValues.push(value);
          }
        }
      });
    });

    fieldMap.forEach((info, name) => {
      const types = Array.from(info.types).filter(t => t !== 'null');
      const primaryType = this.resolvePrimaryType(types);
      
      const field: FieldInfo = {
        name,
        type: primaryType,
        nullable: info.nullable,
        uniqueValues: info.values.size <= 100 ? Array.from(info.values) : undefined
      };

      if (primaryType === 'number' && info.numericValues.length > 0) {
        field.min = Math.min(...info.numericValues);
        field.max = Math.max(...info.numericValues);
      }

      fields.push(field);
    });

    const estimatedSize = this.estimateDataSize(data);

    return {
      fields,
      totalRows: data.length,
      estimatedSize
    };
  }

  private static inferType(value: DataValue): 'string' | 'number' | 'boolean' | 'date' {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    
    if (typeof value === 'string') {
      // Try to parse as date
      const dateValue = new Date(value);
      if (!isNaN(dateValue.getTime()) && this.isValidDateString(value)) {
        return 'date';
      }
      
      // Try to parse as number
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && isFinite(numValue) && value.trim() === numValue.toString()) {
        return 'number';
      }
    }

    return 'string';
  }

  private static isValidDateString(str: string): boolean {
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}\/\d{2}\/\d{4}$/,
      /^\d{2}-\d{2}-\d{4}$/,
      /^\d{4}\/\d{2}\/\d{2}$/
    ];

    return datePatterns.some(pattern => pattern.test(str));
  }

  private static resolvePrimaryType(types: string[]): 'string' | 'number' | 'boolean' | 'date' {
    if (types.length === 0) return 'string';
    if (types.length === 1) return types[0] as any;

    const priority = ['date', 'number', 'boolean', 'string'];
    for (const type of priority) {
      if (types.includes(type)) {
        return type as any;
      }
    }

    return 'string';
  }

  private static validateAgainstSchema(data: DataRow[], schema: DataSchema): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const fieldNames = new Set(schema.fields.map(f => f.name));

    data.forEach((row, rowIndex) => {
      Object.keys(row).forEach(key => {
        if (!fieldNames.has(key)) {
          warnings.push(`Row ${rowIndex + 1}: Unexpected field '${key}'`);
        }
      });

      schema.fields.forEach(field => {
        const value = row[field.name];
        
        if (!field.nullable && (value === null || value === undefined)) {
          errors.push(`Row ${rowIndex + 1}: Field '${field.name}' cannot be null`);
        }

        if (value !== null && value !== undefined) {
          const actualType = this.inferType(value);
          if (actualType !== field.type) {
            warnings.push(`Row ${rowIndex + 1}: Field '${field.name}' expected ${field.type}, got ${actualType}`);
          }
        }
      });
    });

    return { errors, warnings };
  }

  private static estimateDataSize(data: DataRow[]): number {
    if (data.length === 0) return 0;

    const sampleSize = Math.min(100, data.length);
    let totalSize = 0;

    for (let i = 0; i < sampleSize; i++) {
      totalSize += this.estimateRowSize(data[i]);
    }

    return Math.round((totalSize / sampleSize) * data.length);
  }

  private static estimateRowSize(row: DataRow): number {
    return JSON.stringify(row).length * 2; // Rough estimate including object overhead
  }
}