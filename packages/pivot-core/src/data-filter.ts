import { DataRow, DataValue, DataFilter, DataSort } from './types/data.types';

export class DataFilterService {
  static filter(data: DataRow[], filters: DataFilter[]): DataRow[] {
    if (!filters || filters.length === 0) return data;

    return data.filter(row => 
      filters.every(filter => this.matchesFilter(row, filter))
    );
  }

  static sort(data: DataRow[], sorts: DataSort[]): DataRow[] {
    if (!sorts || sorts.length === 0) return data;

    return [...data].sort((a, b) => {
      for (const sort of sorts) {
        const comparison = this.compareValues(a[sort.field], b[sort.field]);
        if (comparison !== 0) {
          return sort.direction === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  static search(data: DataRow[], searchTerm: string, fields?: string[]): DataRow[] {
    if (!searchTerm.trim()) return data;

    const term = searchTerm.toLowerCase();
    const searchFields = fields || Object.keys(data[0] || {});

    return data.filter(row =>
      searchFields.some(field => {
        const value = row[field];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(term);
      })
    );
  }

  private static matchesFilter(row: DataRow, filter: DataFilter): boolean {
    const value = row[filter.field];
    const filterValue = filter.value;

    switch (filter.operator) {
      case 'eq':
        return this.compareValues(value, filterValue as DataValue) === 0;
      case 'ne':
        return this.compareValues(value, filterValue as DataValue) !== 0;
      case 'gt':
        return this.compareValues(value, filterValue as DataValue) > 0;
      case 'gte':
        return this.compareValues(value, filterValue as DataValue) >= 0;
      case 'lt':
        return this.compareValues(value, filterValue as DataValue) < 0;
      case 'lte':
        return this.compareValues(value, filterValue as DataValue) <= 0;
      case 'contains':
        return String(value || '').toLowerCase().includes(String(filterValue || '').toLowerCase());
      case 'startsWith':
        return String(value || '').toLowerCase().startsWith(String(filterValue || '').toLowerCase());
      case 'endsWith':
        return String(value || '').toLowerCase().endsWith(String(filterValue || '').toLowerCase());
      case 'in':
        if (!Array.isArray(filterValue)) return false;
        return filterValue.some(v => this.compareValues(value, v) === 0);
      case 'notIn':
        if (!Array.isArray(filterValue)) return true;
        return !filterValue.some(v => this.compareValues(value, v) === 0);
      default:
        return true;
    }
  }

  private static compareValues(a: DataValue, b: DataValue): number {
    if (a === null || a === undefined) {
      if (b === null || b === undefined) return 0;
      return -1;
    }
    if (b === null || b === undefined) return 1;

    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }

    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    const aStr = String(a).toLowerCase();
    const bStr = String(b).toLowerCase();
    
    if (aStr < bStr) return -1;
    if (aStr > bStr) return 1;
    return 0;
  }

  static getUniqueValues(data: DataRow[], field: string): DataValue[] {
    const values = new Set<DataValue>();
    data.forEach(row => {
      const value = row[field];
      if (value !== null && value !== undefined) {
        values.add(value);
      }
    });
    return Array.from(values).sort((a, b) => this.compareValues(a, b));
  }

  static getFieldStatistics(data: DataRow[], field: string): {
    count: number;
    nullCount: number;
    uniqueCount: number;
    min?: DataValue;
    max?: DataValue;
    average?: number;
  } {
    const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined);
    const nullCount = data.length - values.length;
    const uniqueValues = new Set(values);

    const stats = {
      count: values.length,
      nullCount,
      uniqueCount: uniqueValues.size,
      min: undefined as DataValue,
      max: undefined as DataValue,
      average: undefined as number | undefined
    };

    if (values.length > 0) {
      const sortedValues = [...values].sort((a, b) => this.compareValues(a, b));
      stats.min = sortedValues[0];
      stats.max = sortedValues[sortedValues.length - 1];

      // Calculate average for numeric values
      const numericValues = values.map(v => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const parsed = parseFloat(v);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      }).filter(v => v !== null) as number[];

      if (numericValues.length > 0) {
        stats.average = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      }
    }

    return stats;
  }
}