import { DataRow, DataValue } from './types/data.types';
import { AggregationType } from './types/pivot.types';

export class DataAggregator {
  static aggregate(data: DataRow[], field: string, aggregationType: AggregationType): DataValue {
    if (!data || data.length === 0) return null;

    const values = data
      .map(row => row[field])
      .filter(value => value !== null && value !== undefined);

    if (values.length === 0) return null;

    switch (aggregationType) {
      case 'sum':
        return this.sum(values);
      case 'count':
        return values.length;
      case 'countDistinct':
        return new Set(values).size;
      case 'average':
        return this.average(values);
      case 'min':
        return this.min(values);
      case 'max':
        return this.max(values);
      case 'median':
        return this.median(values);
      case 'mode':
        return this.mode(values);
      default:
        throw new Error(`Unsupported aggregation type: ${aggregationType}`);
    }
  }

  static groupBy(data: DataRow[], fields: string[]): Map<string, DataRow[]> {
    const groups = new Map<string, DataRow[]>();

    data.forEach(row => {
      const key = fields.map(field => String(row[field] ?? '')).join('|');
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    });

    return groups;
  }

  static pivot(data: DataRow[], rowFields: string[], columnFields: string[], valueField: string, aggregationType: AggregationType): any {
    const result: any = {};

    // Group by row fields
    const rowGroups = this.groupBy(data, rowFields);

    rowGroups.forEach((rowData, rowKey) => {
      result[rowKey] = {};

      // Group by column fields within each row group
      const columnGroups = this.groupBy(rowData, columnFields);

      columnGroups.forEach((cellData, columnKey) => {
        result[rowKey][columnKey] = this.aggregate(cellData, valueField, aggregationType);
      });
    });

    return result;
  }

  private static sum(values: DataValue[]): number {
    return values.reduce<number>((acc, value) => {
      const num = this.toNumber(value);
      return acc + (isNaN(num) ? 0 : num);
    }, 0);
  }

  private static average(values: DataValue[]): number {
    const numericValues = values.map(this.toNumber).filter(n => !isNaN(n));
    if (numericValues.length === 0) return 0;
    return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
  }

  private static min(values: DataValue[]): DataValue {
    const numericValues = values.map(this.toNumber).filter(n => !isNaN(n));
    if (numericValues.length === 0) return null;
    return Math.min(...numericValues);
  }

  private static max(values: DataValue[]): DataValue {
    const numericValues = values.map(this.toNumber).filter(n => !isNaN(n));
    if (numericValues.length === 0) return null;
    return Math.max(...numericValues);
  }

  private static median(values: DataValue[]): number {
    const numericValues = values.map(this.toNumber).filter(n => !isNaN(n)).sort((a, b) => a - b);
    if (numericValues.length === 0) return 0;
    
    const mid = Math.floor(numericValues.length / 2);
    return numericValues.length % 2 === 0
      ? (numericValues[mid - 1] + numericValues[mid]) / 2
      : numericValues[mid];
  }

  private static mode(values: DataValue[]): DataValue {
    const frequency = new Map<DataValue, number>();
    let maxCount = 0;
    let mode: DataValue = null;

    values.forEach(value => {
      const count = (frequency.get(value) || 0) + 1;
      frequency.set(value, count);
      
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    });

    return mode;
  }

  private static toNumber(value: DataValue): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? NaN : parsed;
    }
    if (value instanceof Date) return value.getTime();
    return NaN;
  }
}