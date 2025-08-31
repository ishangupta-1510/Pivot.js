// src/aggregator.ts
var DataAggregator = class {
  static aggregate(data, field, aggregationType) {
    if (!data || data.length === 0) return null;
    const values = data.map((row) => row[field]).filter((value) => value !== null && value !== void 0);
    if (values.length === 0) return null;
    switch (aggregationType) {
      case "sum":
        return this.sum(values);
      case "count":
        return values.length;
      case "countDistinct":
        return new Set(values).size;
      case "average":
        return this.average(values);
      case "min":
        return this.min(values);
      case "max":
        return this.max(values);
      case "median":
        return this.median(values);
      case "mode":
        return this.mode(values);
      default:
        throw new Error(`Unsupported aggregation type: ${aggregationType}`);
    }
  }
  static groupBy(data, fields) {
    const groups = /* @__PURE__ */ new Map();
    data.forEach((row) => {
      const key = fields.map((field) => String(row[field] ?? "")).join("|");
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    });
    return groups;
  }
  static pivot(data, rowFields, columnFields, valueField, aggregationType) {
    const result = {};
    const rowGroups = this.groupBy(data, rowFields);
    rowGroups.forEach((rowData, rowKey) => {
      result[rowKey] = {};
      const columnGroups = this.groupBy(rowData, columnFields);
      columnGroups.forEach((cellData, columnKey) => {
        result[rowKey][columnKey] = this.aggregate(cellData, valueField, aggregationType);
      });
    });
    return result;
  }
  static sum(values) {
    return values.reduce((acc, value) => {
      const num = this.toNumber(value);
      return acc + (isNaN(num) ? 0 : num);
    }, 0);
  }
  static average(values) {
    const numericValues = values.map(this.toNumber).filter((n) => !isNaN(n));
    if (numericValues.length === 0) return 0;
    return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
  }
  static min(values) {
    const numericValues = values.map(this.toNumber).filter((n) => !isNaN(n));
    if (numericValues.length === 0) return null;
    return Math.min(...numericValues);
  }
  static max(values) {
    const numericValues = values.map(this.toNumber).filter((n) => !isNaN(n));
    if (numericValues.length === 0) return null;
    return Math.max(...numericValues);
  }
  static median(values) {
    const numericValues = values.map(this.toNumber).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    if (numericValues.length === 0) return 0;
    const mid = Math.floor(numericValues.length / 2);
    return numericValues.length % 2 === 0 ? (numericValues[mid - 1] + numericValues[mid]) / 2 : numericValues[mid];
  }
  static mode(values) {
    const frequency = /* @__PURE__ */ new Map();
    let maxCount = 0;
    let mode = null;
    values.forEach((value) => {
      const count = (frequency.get(value) || 0) + 1;
      frequency.set(value, count);
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    });
    return mode;
  }
  static toNumber(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? NaN : parsed;
    }
    if (value instanceof Date) return value.getTime();
    return NaN;
  }
};

// src/data-filter.ts
var DataFilterService = class {
  static filter(data, filters) {
    if (!filters || filters.length === 0) return data;
    return data.filter(
      (row) => filters.every((filter) => this.matchesFilter(row, filter))
    );
  }
  static sort(data, sorts) {
    if (!sorts || sorts.length === 0) return data;
    return [...data].sort((a, b) => {
      for (const sort of sorts) {
        const comparison = this.compareValues(a[sort.field], b[sort.field]);
        if (comparison !== 0) {
          return sort.direction === "desc" ? -comparison : comparison;
        }
      }
      return 0;
    });
  }
  static search(data, searchTerm, fields) {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    const searchFields = fields || Object.keys(data[0] || {});
    return data.filter(
      (row) => searchFields.some((field) => {
        const value = row[field];
        if (value === null || value === void 0) return false;
        return String(value).toLowerCase().includes(term);
      })
    );
  }
  static matchesFilter(row, filter) {
    const value = row[filter.field];
    const filterValue = filter.value;
    switch (filter.operator) {
      case "eq":
        return this.compareValues(value, filterValue) === 0;
      case "ne":
        return this.compareValues(value, filterValue) !== 0;
      case "gt":
        return this.compareValues(value, filterValue) > 0;
      case "gte":
        return this.compareValues(value, filterValue) >= 0;
      case "lt":
        return this.compareValues(value, filterValue) < 0;
      case "lte":
        return this.compareValues(value, filterValue) <= 0;
      case "contains":
        return String(value || "").toLowerCase().includes(String(filterValue || "").toLowerCase());
      case "startsWith":
        return String(value || "").toLowerCase().startsWith(String(filterValue || "").toLowerCase());
      case "endsWith":
        return String(value || "").toLowerCase().endsWith(String(filterValue || "").toLowerCase());
      case "in":
        if (!Array.isArray(filterValue)) return false;
        return filterValue.some((v) => this.compareValues(value, v) === 0);
      case "notIn":
        if (!Array.isArray(filterValue)) return true;
        return !filterValue.some((v) => this.compareValues(value, v) === 0);
      default:
        return true;
    }
  }
  static compareValues(a, b) {
    if (a === null || a === void 0) {
      if (b === null || b === void 0) return 0;
      return -1;
    }
    if (b === null || b === void 0) return 1;
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    const aStr = String(a).toLowerCase();
    const bStr = String(b).toLowerCase();
    if (aStr < bStr) return -1;
    if (aStr > bStr) return 1;
    return 0;
  }
  static getUniqueValues(data, field) {
    const values = /* @__PURE__ */ new Set();
    data.forEach((row) => {
      const value = row[field];
      if (value !== null && value !== void 0) {
        values.add(value);
      }
    });
    return Array.from(values).sort((a, b) => this.compareValues(a, b));
  }
  static getFieldStatistics(data, field) {
    const values = data.map((row) => row[field]).filter((v) => v !== null && v !== void 0);
    const nullCount = data.length - values.length;
    const uniqueValues = new Set(values);
    const stats = {
      count: values.length,
      nullCount,
      uniqueCount: uniqueValues.size,
      min: void 0,
      max: void 0,
      average: void 0
    };
    if (values.length > 0) {
      const sortedValues = [...values].sort((a, b) => this.compareValues(a, b));
      stats.min = sortedValues[0];
      stats.max = sortedValues[sortedValues.length - 1];
      const numericValues = values.map((v) => {
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const parsed = parseFloat(v);
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      }).filter((v) => v !== null);
      if (numericValues.length > 0) {
        stats.average = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
      }
    }
    return stats;
  }
};

// src/data-transformer.ts
var DataTransformer = class {
  static normalizeData(data, schema) {
    return data.map((row) => {
      const normalizedRow = {};
      schema.forEach((field) => {
        const value = row[field.name];
        normalizedRow[field.name] = this.normalizeValue(value, field);
      });
      return normalizedRow;
    });
  }
  static transformField(data, fieldName, transformer) {
    return data.map((row) => ({
      ...row,
      [fieldName]: transformer(row[fieldName])
    }));
  }
  static addCalculatedField(data, fieldName, calculator) {
    return data.map((row) => ({
      ...row,
      [fieldName]: calculator(row)
    }));
  }
  static renameField(data, oldName, newName) {
    return data.map((row) => {
      const newRow = { ...row };
      if (oldName in newRow) {
        newRow[newName] = newRow[oldName];
        delete newRow[oldName];
      }
      return newRow;
    });
  }
  static removeFields(data, fieldsToRemove) {
    return data.map((row) => {
      const newRow = { ...row };
      fieldsToRemove.forEach((field) => {
        delete newRow[field];
      });
      return newRow;
    });
  }
  static selectFields(data, fieldsToKeep) {
    return data.map((row) => {
      const newRow = {};
      fieldsToKeep.forEach((field) => {
        if (field in row) {
          newRow[field] = row[field];
        }
      });
      return newRow;
    });
  }
  static fillMissingValues(data, field, fillValue) {
    return data.map((row) => {
      const value = row[field];
      if (value === null || value === void 0 || value === "") {
        const newValue = typeof fillValue === "function" ? fillValue(row) : fillValue;
        return { ...row, [field]: newValue };
      }
      return row;
    });
  }
  static removeDuplicates(data, keyFields) {
    const seen = /* @__PURE__ */ new Set();
    const fields = keyFields || Object.keys(data[0] || {});
    return data.filter((row) => {
      const key = fields.map((field) => String(row[field] ?? "")).join("|");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  static groupAndTransform(data, groupByFields, transforms) {
    const groups = /* @__PURE__ */ new Map();
    data.forEach((row) => {
      const key = groupByFields.map((field) => String(row[field] ?? "")).join("|");
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(row);
    });
    const result = [];
    groups.forEach((group, key) => {
      const keyValues = key.split("|");
      const transformedRow = {};
      groupByFields.forEach((field, index) => {
        transformedRow[field] = this.parseValue(keyValues[index]);
      });
      Object.keys(transforms).forEach((fieldName) => {
        transformedRow[fieldName] = transforms[fieldName](group);
      });
      result.push(transformedRow);
    });
    return result;
  }
  static pivotData(data, rowFields, columnField, valueField, aggregator = (values) => values.length) {
    const columnValues = /* @__PURE__ */ new Set();
    data.forEach((row) => {
      const colValue = row[columnField];
      if (colValue !== null && colValue !== void 0) {
        columnValues.add(colValue);
      }
    });
    const sortedColumnValues = Array.from(columnValues).sort();
    const rowGroups = /* @__PURE__ */ new Map();
    data.forEach((row) => {
      const key = rowFields.map((field) => String(row[field] ?? "")).join("|");
      if (!rowGroups.has(key)) {
        rowGroups.set(key, []);
      }
      rowGroups.get(key).push(row);
    });
    const result = [];
    rowGroups.forEach((group, key) => {
      const keyValues = key.split("|");
      const pivotedRow = {};
      rowFields.forEach((field, index) => {
        pivotedRow[field] = this.parseValue(keyValues[index]);
      });
      sortedColumnValues.forEach((colValue) => {
        const colData = group.filter((row) => row[columnField] === colValue);
        const values = colData.map((row) => row[valueField]);
        const columnName = String(colValue);
        pivotedRow[columnName] = values.length > 0 ? aggregator(values) : null;
      });
      result.push(pivotedRow);
    });
    return result;
  }
  static normalizeValue(value, field) {
    if (value === null || value === void 0) {
      return field.nullable ? null : this.getDefaultValue(field.type);
    }
    switch (field.type) {
      case "number":
        if (typeof value === "number") return value;
        if (typeof value === "string") {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
      case "boolean":
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          const lower = value.toLowerCase();
          return lower === "true" || lower === "1" || lower === "yes";
        }
        if (typeof value === "number") return value !== 0;
        return false;
      case "date":
        if (value instanceof Date) return value;
        if (typeof value === "string" || typeof value === "number") {
          const date = new Date(value);
          return isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
        }
        return /* @__PURE__ */ new Date();
      case "string":
      default:
        return String(value);
    }
  }
  static getDefaultValue(type) {
    switch (type) {
      case "number":
        return 0;
      case "boolean":
        return false;
      case "date":
        return /* @__PURE__ */ new Date();
      case "string":
        return "";
      default:
        return "";
    }
  }
  static parseValue(value) {
    if (!value || value === "null" || value === "undefined") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && isFinite(numValue)) {
      return numValue;
    }
    const dateValue = new Date(value);
    if (!isNaN(dateValue.getTime())) {
      return dateValue;
    }
    return value;
  }
};

// src/data-validator.ts
var DataValidator = class {
  static validateDataset(data) {
    const errors = [];
    const warnings = [];
    if (!data || !Array.isArray(data)) {
      errors.push("Data must be an array");
      return {
        isValid: false,
        errors,
        warnings,
        schema: { fields: [], totalRows: 0, estimatedSize: 0 }
      };
    }
    if (data.length === 0) {
      warnings.push("Dataset is empty");
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
  static generateSchema(data) {
    if (data.length === 0) {
      return { fields: [], totalRows: 0, estimatedSize: 0 };
    }
    const fields = [];
    const fieldMap = /* @__PURE__ */ new Map();
    data.forEach((row, index) => {
      if (index >= 1e3) return;
      Object.keys(row).forEach((key) => {
        if (!fieldMap.has(key)) {
          fieldMap.set(key, {
            types: /* @__PURE__ */ new Set(),
            nullable: false,
            values: /* @__PURE__ */ new Set(),
            numericValues: []
          });
        }
        const fieldInfo = fieldMap.get(key);
        const value = row[key];
        if (value === null || value === void 0) {
          fieldInfo.nullable = true;
          fieldInfo.types.add("null");
        } else {
          fieldInfo.values.add(value);
          const type = this.inferType(value);
          fieldInfo.types.add(type);
          if (type === "number" && typeof value === "number") {
            fieldInfo.numericValues.push(value);
          }
        }
      });
    });
    fieldMap.forEach((info, name) => {
      const types = Array.from(info.types).filter((t) => t !== "null");
      const primaryType = this.resolvePrimaryType(types);
      const field = {
        name,
        type: primaryType,
        nullable: info.nullable,
        uniqueValues: info.values.size <= 100 ? Array.from(info.values) : void 0
      };
      if (primaryType === "number" && info.numericValues.length > 0) {
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
  static inferType(value) {
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (value instanceof Date) return "date";
    if (typeof value === "string") {
      const dateValue = new Date(value);
      if (!isNaN(dateValue.getTime()) && this.isValidDateString(value)) {
        return "date";
      }
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && isFinite(numValue) && value.trim() === numValue.toString()) {
        return "number";
      }
    }
    return "string";
  }
  static isValidDateString(str) {
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}\/\d{2}\/\d{4}$/,
      /^\d{2}-\d{2}-\d{4}$/,
      /^\d{4}\/\d{2}\/\d{2}$/
    ];
    return datePatterns.some((pattern) => pattern.test(str));
  }
  static resolvePrimaryType(types) {
    if (types.length === 0) return "string";
    if (types.length === 1) return types[0];
    const priority = ["date", "number", "boolean", "string"];
    for (const type of priority) {
      if (types.includes(type)) {
        return type;
      }
    }
    return "string";
  }
  static validateAgainstSchema(data, schema) {
    const errors = [];
    const warnings = [];
    const fieldNames = new Set(schema.fields.map((f) => f.name));
    data.forEach((row, rowIndex) => {
      Object.keys(row).forEach((key) => {
        if (!fieldNames.has(key)) {
          warnings.push(`Row ${rowIndex + 1}: Unexpected field '${key}'`);
        }
      });
      schema.fields.forEach((field) => {
        const value = row[field.name];
        if (!field.nullable && (value === null || value === void 0)) {
          errors.push(`Row ${rowIndex + 1}: Field '${field.name}' cannot be null`);
        }
        if (value !== null && value !== void 0) {
          const actualType = this.inferType(value);
          if (actualType !== field.type) {
            warnings.push(`Row ${rowIndex + 1}: Field '${field.name}' expected ${field.type}, got ${actualType}`);
          }
        }
      });
    });
    return { errors, warnings };
  }
  static estimateDataSize(data) {
    if (data.length === 0) return 0;
    const sampleSize = Math.min(100, data.length);
    let totalSize = 0;
    for (let i = 0; i < sampleSize; i++) {
      totalSize += this.estimateRowSize(data[i]);
    }
    return Math.round(totalSize / sampleSize * data.length);
  }
  static estimateRowSize(row) {
    return JSON.stringify(row).length * 2;
  }
};

// src/pivot-engine.ts
var PivotEngine = class {
  constructor(data, config) {
    this.data = data;
    this.config = config;
  }
  generate() {
    const startTime = performance.now();
    const filteredData = this.applyFilters();
    const { rowHeaders, columnHeaders } = this.buildHeaders(filteredData);
    const dataMatrix = this.buildDataMatrix(filteredData, rowHeaders, columnHeaders);
    const pivotTable = {
      rows: this.buildPivotRows(rowHeaders, dataMatrix),
      columns: this.buildPivotColumns(columnHeaders),
      data: dataMatrix,
      metadata: {
        totalRows: rowHeaders.length,
        totalColumns: columnHeaders.length,
        configuration: this.config,
        generatedAt: /* @__PURE__ */ new Date(),
        processingTime: performance.now() - startTime
      }
    };
    return pivotTable;
  }
  applyFilters() {
    let filteredData = [...this.data];
    if (this.config.filters && this.config.filters.length > 0) {
      this.config.filters.forEach((filter) => {
        filteredData = filteredData.filter((row) => {
          const value = row[filter.name];
          return value !== null && value !== void 0;
        });
      });
    }
    if (this.config.excludeEmptyRows) {
      filteredData = filteredData.filter((row) => {
        return this.config.rows.some((field) => {
          const value = row[field.name];
          return value !== null && value !== void 0 && value !== "";
        });
      });
    }
    return filteredData;
  }
  buildHeaders(data) {
    const rowHeadersSet = /* @__PURE__ */ new Set();
    const columnHeadersSet = /* @__PURE__ */ new Set();
    data.forEach((row) => {
      const rowKey = this.config.rows.map((field) => {
        const value = row[field.name];
        return this.formatValue(value, field.format);
      }).join("|");
      rowHeadersSet.add(rowKey);
      const columnKey = this.config.columns.map((field) => {
        const value = row[field.name];
        return this.formatValue(value, field.format);
      }).join("|");
      columnHeadersSet.add(columnKey);
    });
    const rowHeaders = Array.from(rowHeadersSet).map((key) => key.split("|"));
    const columnHeaders = Array.from(columnHeadersSet).map((key) => key.split("|"));
    return { rowHeaders, columnHeaders };
  }
  buildDataMatrix(data, rowHeaders, columnHeaders) {
    const matrix = [];
    rowHeaders.forEach((rowHeader, rowIndex) => {
      const row = [];
      columnHeaders.forEach((columnHeader, colIndex) => {
        const cellData = this.getCellData(data, rowHeader, columnHeader);
        const cell = this.createPivotCell(cellData, rowIndex, colIndex);
        row.push(cell);
      });
      matrix.push(row);
    });
    if (this.config.showGrandTotals) {
      this.addGrandTotals(matrix, data, rowHeaders, columnHeaders);
    }
    if (this.config.showRowSubtotals) {
      this.addRowSubtotals(matrix, data, rowHeaders, columnHeaders);
    }
    if (this.config.showColumnSubtotals) {
      this.addColumnSubtotals(matrix, data, rowHeaders, columnHeaders);
    }
    return matrix;
  }
  getCellData(data, rowHeader, columnHeader) {
    return data.filter((row) => {
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
  createPivotCell(data, row, column) {
    let value = null;
    let formattedValue = "";
    if (this.config.values.length > 0) {
      const valueField = this.config.values[0];
      const aggregationType = valueField.aggregation || "sum";
      value = DataAggregator.aggregate(data, valueField.name, aggregationType);
      formattedValue = valueField.format ? valueField.format(value) : this.formatValue(value);
    } else {
      value = data.length;
      formattedValue = String(value);
    }
    return {
      value,
      formattedValue,
      rawValue: value,
      aggregationType: this.config.values[0]?.aggregation || "count",
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
  buildPivotRows(headers, dataMatrix) {
    return headers.map((header, index) => ({
      cells: dataMatrix[index] || [],
      level: 0,
      isExpanded: true,
      hasChildren: false,
      parentPath: header.slice(0, -1),
      key: header.join("|")
    }));
  }
  buildPivotColumns(headers) {
    return headers.map((header) => ({
      name: header[header.length - 1],
      displayName: header[header.length - 1],
      width: 120,
      level: 0,
      parentPath: header.slice(0, -1),
      key: header.join("|"),
      isExpanded: true,
      hasChildren: false
    }));
  }
  addGrandTotals(matrix, _data, _rowHeaders, columnHeaders) {
    const grandTotalRow = [];
    columnHeaders.forEach((_, colIndex) => {
      const allCellData = matrix.map((row) => row[colIndex]).flatMap((cell2) => cell2.contributingRows || []);
      const cell = this.createPivotCell(allCellData, matrix.length, colIndex);
      cell.metadata.isGrandTotal = true;
      grandTotalRow.push(cell);
    });
    matrix.push(grandTotalRow);
    matrix.forEach((row, rowIndex) => {
      const allCellData = row.flatMap((cell2) => cell2.contributingRows || []);
      const cell = this.createPivotCell(allCellData, rowIndex, row.length);
      cell.metadata.isGrandTotal = true;
      row.push(cell);
    });
  }
  addRowSubtotals(_matrix, _data, _rowHeaders, _columnHeaders) {
  }
  addColumnSubtotals(_matrix, _data, _rowHeaders, _columnHeaders) {
  }
  formatValue(value, formatter) {
    if (formatter) {
      return formatter(value);
    }
    if (value === null || value === void 0) {
      return "";
    }
    if (typeof value === "number") {
      return value.toLocaleString();
    }
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    return String(value);
  }
  updateConfiguration(config) {
    this.config = { ...this.config, ...config };
  }
  updateData(data) {
    this.data = data;
  }
};

export { DataAggregator, DataFilterService, DataTransformer, DataValidator, PivotEngine };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map