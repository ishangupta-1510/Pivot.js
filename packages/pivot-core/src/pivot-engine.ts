import { 
  DataRow, 
  DataValue 
} from './types/data.types';
import {
  PivotConfiguration, 
  PivotTable, 
  PivotCell, 
  PivotRow, 
  PivotColumn
} from './types/pivot.types';
import { DataAggregator } from './aggregator';

export class PivotEngine {
  private config: PivotConfiguration;
  private data: DataRow[];

  constructor(data: DataRow[], config: PivotConfiguration) {
    this.data = data;
    this.config = config;
  }

  generate(): PivotTable {
    const startTime = performance.now();

    const filteredData = this.applyFilters();
    const { rowHeaders, columnHeaders } = this.buildHeaders(filteredData);
    const dataMatrix = this.buildDataMatrix(filteredData, rowHeaders, columnHeaders);
    
    const pivotTable: PivotTable = {
      rows: this.buildPivotRows(rowHeaders, dataMatrix),
      columns: this.buildPivotColumns(columnHeaders),
      data: dataMatrix,
      metadata: {
        totalRows: rowHeaders.length,
        totalColumns: columnHeaders.length,
        configuration: this.config,
        generatedAt: new Date(),
        processingTime: performance.now() - startTime
      }
    };

    return pivotTable;
  }

  private applyFilters(): DataRow[] {
    let filteredData = [...this.data];

    if (this.config.filters && this.config.filters.length > 0) {
      this.config.filters.forEach(filter => {
        filteredData = filteredData.filter(row => {
          const value = row[filter.name];
          return value !== null && value !== undefined;
        });
      });
    }

    if (this.config.excludeEmptyRows) {
      filteredData = filteredData.filter(row => {
        return this.config.rows.some(field => {
          const value = row[field.name];
          return value !== null && value !== undefined && value !== '';
        });
      });
    }

    return filteredData;
  }

  private buildHeaders(data: DataRow[]): { rowHeaders: string[][], columnHeaders: string[][] } {
    const rowHeadersSet = new Set<string>();
    const columnHeadersSet = new Set<string>();

    data.forEach(row => {
      // Build row headers
      const rowKey = this.config.rows.map(field => {
        const value = row[field.name];
        return this.formatValue(value, field.format);
      }).join('|');
      rowHeadersSet.add(rowKey);

      // Build column headers
      const columnKey = this.config.columns.map(field => {
        const value = row[field.name];
        return this.formatValue(value, field.format);
      }).join('|');
      columnHeadersSet.add(columnKey);
    });

    const rowHeaders = Array.from(rowHeadersSet).map(key => key.split('|'));
    const columnHeaders = Array.from(columnHeadersSet).map(key => key.split('|'));

    return { rowHeaders, columnHeaders };
  }

  private buildDataMatrix(data: DataRow[], rowHeaders: string[][], columnHeaders: string[][]): PivotCell[][] {
    const matrix: PivotCell[][] = [];

    rowHeaders.forEach((rowHeader, rowIndex) => {
      const row: PivotCell[] = [];

      columnHeaders.forEach((columnHeader, colIndex) => {
        const cellData = this.getCellData(data, rowHeader, columnHeader);
        const cell = this.createPivotCell(cellData, rowIndex, colIndex);
        row.push(cell);
      });

      matrix.push(row);
    });

    // Add grand totals if enabled
    if (this.config.showGrandTotals) {
      this.addGrandTotals(matrix, data, rowHeaders, columnHeaders);
    }

    // Add subtotals if enabled
    if (this.config.showRowSubtotals) {
      this.addRowSubtotals(matrix, data, rowHeaders, columnHeaders);
    }

    if (this.config.showColumnSubtotals) {
      this.addColumnSubtotals(matrix, data, rowHeaders, columnHeaders);
    }

    return matrix;
  }

  private getCellData(data: DataRow[], rowHeader: string[], columnHeader: string[]): DataRow[] {
    return data.filter(row => {
      const rowMatch = this.config.rows.every((field, index) => {
        const value = this.formatValue(row[field.name], field.format);
        return value === rowHeader[index];
      });

      const columnMatch = this.config.columns.every((field, index) => {
        const value = this.formatValue(row[field.name], field.format);
        return value === columnHeader[index];
      });

      return rowMatch && columnMatch;
    });
  }

  private createPivotCell(data: DataRow[], row: number, column: number): PivotCell {
    let value: DataValue = null;
    let formattedValue = '';

    if (this.config.values.length > 0) {
      const valueField = this.config.values[0]; // For now, handle single value field
      const aggregationType = valueField.aggregation || 'sum';
      
      value = DataAggregator.aggregate(data, valueField.name, aggregationType);
      formattedValue = valueField.format 
        ? valueField.format(value)
        : this.formatValue(value);
    } else {
      value = data.length;
      formattedValue = String(value);
    }

    return {
      value,
      formattedValue,
      rawValue: value,
      aggregationType: this.config.values[0]?.aggregation || 'count',
      contributingRows: data,
      coordinates: { row, column },
      metadata: {
        isGrandTotal: false,
        isSubtotal: false,
        isHeader: false,
        level: 0,
        parentPath: []
      }
    };
  }

  private buildPivotRows(headers: string[][], dataMatrix: PivotCell[][]): PivotRow[] {
    return headers.map((header, index) => ({
      cells: dataMatrix[index] || [],
      level: 0,
      isExpanded: true,
      hasChildren: false,
      parentPath: header.slice(0, -1),
      key: header.join('|')
    }));
  }

  private buildPivotColumns(headers: string[][]): PivotColumn[] {
    return headers.map((header) => ({
      name: header[header.length - 1],
      displayName: header[header.length - 1],
      width: 120,
      level: 0,
      parentPath: header.slice(0, -1),
      key: header.join('|'),
      isExpanded: true,
      hasChildren: false
    }));
  }

  private addGrandTotals(matrix: PivotCell[][], _data: DataRow[], _rowHeaders: string[][], columnHeaders: string[][]): void {
    // Add grand total row
    const grandTotalRow: PivotCell[] = [];
    columnHeaders.forEach((_, colIndex) => {
      const allCellData = matrix.map(row => row[colIndex]).flatMap(cell => cell.contributingRows || []);
      const cell = this.createPivotCell(allCellData, matrix.length, colIndex);
      cell.metadata!.isGrandTotal = true;
      grandTotalRow.push(cell);
    });
    matrix.push(grandTotalRow);

    // Add grand total column
    matrix.forEach((row, rowIndex) => {
      const allCellData = row.flatMap(cell => cell.contributingRows || []);
      const cell = this.createPivotCell(allCellData, rowIndex, row.length);
      cell.metadata!.isGrandTotal = true;
      row.push(cell);
    });
  }

  private addRowSubtotals(_matrix: PivotCell[][], _data: DataRow[], _rowHeaders: string[][], _columnHeaders: string[][]): void {
    // Implementation for row subtotals
    // This would need to analyze the row hierarchy and insert subtotal rows
  }

  private addColumnSubtotals(_matrix: PivotCell[][], _data: DataRow[], _rowHeaders: string[][], _columnHeaders: string[][]): void {
    // Implementation for column subtotals
    // This would need to analyze the column hierarchy and insert subtotal columns
  }

  private formatValue(value: DataValue, formatter?: (value: DataValue) => string): string {
    if (formatter) {
      return formatter(value);
    }

    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'number') {
      return value.toLocaleString();
    }

    if (value instanceof Date) {
      return value.toLocaleDateString();
    }

    return String(value);
  }

  updateConfiguration(config: Partial<PivotConfiguration>): void {
    this.config = { ...this.config, ...config };
  }

  updateData(data: DataRow[]): void {
    this.data = data;
  }
}