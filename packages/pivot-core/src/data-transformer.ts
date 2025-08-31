import { DataRow, DataValue, FieldInfo } from './types/data.types';

export class DataTransformer {
  static normalizeData(data: DataRow[], schema: FieldInfo[]): DataRow[] {
    return data.map(row => {
      const normalizedRow: DataRow = {};
      
      schema.forEach(field => {
        const value = row[field.name];
        normalizedRow[field.name] = this.normalizeValue(value, field);
      });

      return normalizedRow;
    });
  }

  static transformField(data: DataRow[], fieldName: string, transformer: (value: DataValue) => DataValue): DataRow[] {
    return data.map(row => ({
      ...row,
      [fieldName]: transformer(row[fieldName])
    }));
  }

  static addCalculatedField(
    data: DataRow[], 
    fieldName: string, 
    calculator: (row: DataRow) => DataValue
  ): DataRow[] {
    return data.map(row => ({
      ...row,
      [fieldName]: calculator(row)
    }));
  }

  static renameField(data: DataRow[], oldName: string, newName: string): DataRow[] {
    return data.map(row => {
      const newRow = { ...row };
      if (oldName in newRow) {
        newRow[newName] = newRow[oldName];
        delete newRow[oldName];
      }
      return newRow;
    });
  }

  static removeFields(data: DataRow[], fieldsToRemove: string[]): DataRow[] {
    return data.map(row => {
      const newRow = { ...row };
      fieldsToRemove.forEach(field => {
        delete newRow[field];
      });
      return newRow;
    });
  }

  static selectFields(data: DataRow[], fieldsToKeep: string[]): DataRow[] {
    return data.map(row => {
      const newRow: DataRow = {};
      fieldsToKeep.forEach(field => {
        if (field in row) {
          newRow[field] = row[field];
        }
      });
      return newRow;
    });
  }

  static fillMissingValues(data: DataRow[], field: string, fillValue: DataValue | ((row: DataRow) => DataValue)): DataRow[] {
    return data.map(row => {
      const value = row[field];
      if (value === null || value === undefined || value === '') {
        const newValue = typeof fillValue === 'function' ? fillValue(row) : fillValue;
        return { ...row, [field]: newValue };
      }
      return row;
    });
  }

  static removeDuplicates(data: DataRow[], keyFields?: string[]): DataRow[] {
    const seen = new Set<string>();
    const fields = keyFields || Object.keys(data[0] || {});

    return data.filter(row => {
      const key = fields.map(field => String(row[field] ?? '')).join('|');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  static groupAndTransform(
    data: DataRow[], 
    groupByFields: string[], 
    transforms: { [key: string]: (group: DataRow[]) => DataValue }
  ): DataRow[] {
    const groups = new Map<string, DataRow[]>();

    // Group the data
    data.forEach(row => {
      const key = groupByFields.map(field => String(row[field] ?? '')).join('|');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    });

    // Transform each group
    const result: DataRow[] = [];
    groups.forEach((group, key) => {
      const keyValues = key.split('|');
      const transformedRow: DataRow = {};

      // Add group key fields
      groupByFields.forEach((field, index) => {
        transformedRow[field] = this.parseValue(keyValues[index]);
      });

      // Add transformed fields
      Object.keys(transforms).forEach(fieldName => {
        transformedRow[fieldName] = transforms[fieldName](group);
      });

      result.push(transformedRow);
    });

    return result;
  }

  static pivotData(
    data: DataRow[], 
    rowFields: string[], 
    columnField: string, 
    valueField: string,
    aggregator: (values: DataValue[]) => DataValue = (values) => values.length
  ): DataRow[] {
    // Get all unique column values
    const columnValues = new Set<DataValue>();
    data.forEach(row => {
      const colValue = row[columnField];
      if (colValue !== null && colValue !== undefined) {
        columnValues.add(colValue);
      }
    });

    const sortedColumnValues = Array.from(columnValues).sort();

    // Group by row fields
    const rowGroups = new Map<string, DataRow[]>();
    data.forEach(row => {
      const key = rowFields.map(field => String(row[field] ?? '')).join('|');
      if (!rowGroups.has(key)) {
        rowGroups.set(key, []);
      }
      rowGroups.get(key)!.push(row);
    });

    // Create pivoted data
    const result: DataRow[] = [];
    rowGroups.forEach((group, key) => {
      const keyValues = key.split('|');
      const pivotedRow: DataRow = {};

      // Add row key fields
      rowFields.forEach((field, index) => {
        pivotedRow[field] = this.parseValue(keyValues[index]);
      });

      // Add pivoted columns
      sortedColumnValues.forEach(colValue => {
        const colData = group.filter(row => row[columnField] === colValue);
        const values = colData.map(row => row[valueField]);
        const columnName = String(colValue);
        pivotedRow[columnName] = values.length > 0 ? aggregator(values) : null;
      });

      result.push(pivotedRow);
    });

    return result;
  }

  private static normalizeValue(value: DataValue, field: FieldInfo): DataValue {
    if (value === null || value === undefined) {
      return field.nullable ? null : this.getDefaultValue(field.type);
    }

    switch (field.type) {
      case 'number':
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? 0 : parsed;
        }
        return 0;

      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          return lower === 'true' || lower === '1' || lower === 'yes';
        }
        if (typeof value === 'number') return value !== 0;
        return false;

      case 'date':
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') {
          const date = new Date(value);
          return isNaN(date.getTime()) ? new Date() : date;
        }
        return new Date();

      case 'string':
      default:
        return String(value);
    }
  }

  private static getDefaultValue(type: FieldInfo['type']): DataValue {
    switch (type) {
      case 'number': return 0;
      case 'boolean': return false;
      case 'date': return new Date();
      case 'string': return '';
      default: return '';
    }
  }

  private static parseValue(value: string): DataValue {
    if (!value || value === 'null' || value === 'undefined') return null;
    
    // Try boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Try number
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && isFinite(numValue)) {
      return numValue;
    }

    // Try date
    const dateValue = new Date(value);
    if (!isNaN(dateValue.getTime())) {
      return dateValue;
    }

    return value;
  }
}