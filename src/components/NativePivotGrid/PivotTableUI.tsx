/**
 * PivotTable.js Style UI Component
 * Configurable pivot table with drag-and-drop interface
 */

import React, { useState, useRef, useCallback, useMemo, useEffect, Fragment } from 'react';
import './PivotTable.css';

interface Field {
  id: string;
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'date';
}

interface CalculatedField extends Field {
  formula: string;
  isCalculated: true;
  dependencies: string[];
}

interface PivotTableUIProps {
  data: any[];
  height?: string | number;
  width?: string | number;
  onChange?: (config: any) => void;
  config?: any;
}

const PivotTableUI: React.FC<PivotTableUIProps> = ({ 
  data, 
  height = '100%', 
  width = '100%',
  onChange,
  config: externalConfig
}) => {
  // Extract fields from data - memoize to prevent infinite loops
  const availableFields: Field[] = useMemo(() => {
    if (data.length === 0) return [];
    
    return Object.keys(data[0]).map(key => ({
      id: key,
      name: key,
      displayName: key.charAt(0).toUpperCase() + key.slice(1),
      type: typeof data[0][key] === 'number' ? 'number' : 'string'
    }));
  }, [data]);

  // Configuration state - use external config if provided
  const [config, setConfig] = useState(() => {
    if (externalConfig) {
      // Convert external config format to internal format
      return {
        filters: externalConfig.filters || [],
        rows: externalConfig.rows?.map((r: string) => availableFields.find(f => f.id === r)) || [],
        columns: externalConfig.cols?.map((c: string) => availableFields.find(f => f.id === c)) || [],
        values: externalConfig.vals?.map((v: string) => availableFields.find(f => f.id === v)) || []
      };
    }
    return {
      filters: [] as Field[],
      rows: [] as Field[],
      columns: [] as Field[],
      values: [] as Field[]
    };
  });

  // Aggregator state
  const [aggregator, setAggregator] = useState(externalConfig?.aggregatorName || 'Count');
  
  // Calculated fields state
  const [calculatedFields, setCalculatedFields] = useState<CalculatedField[]>([]);
  const [showFormulaBuilder, setShowFormulaBuilder] = useState(false);
  const [formulaBuilder, setFormulaBuilder] = useState({
    name: '',
    formula: '',
    error: ''
  });
  
  // Drag state
  const draggedField = useRef<Field | null>(null);
  const draggedFrom = useRef<string | null>(null);
  
  // Sync with external config changes
  useEffect(() => {
    if (externalConfig) {
      setConfig({
        filters: externalConfig.filters || [],
        rows: externalConfig.rows?.map((r: string) => availableFields.find(f => f.id === r)).filter(Boolean) || [],
        columns: externalConfig.cols?.map((c: string) => availableFields.find(f => f.id === c)).filter(Boolean) || [],
        values: externalConfig.vals?.map((v: string) => availableFields.find(f => f.id === v)).filter(Boolean) || []
      });
    }
  }, [externalConfig, availableFields]);

  // Notify parent of config changes - debounce to prevent flickering
  useEffect(() => {
    if (!onChange) return;
    
    const timeoutId = setTimeout(() => {
      const exportConfig = {
        rows: config.rows.map(f => f.id),
        cols: config.columns.map(f => f.id),
        vals: config.values.map(f => f.id),
        filters: config.filters,
        aggregatorName: aggregator,
        rendererName: 'Table'
      };
      onChange(exportConfig);
    }, 100); // Small delay to batch updates
    
    return () => clearTimeout(timeoutId);
  }, [config.rows, config.columns, config.values, config.filters, aggregator, onChange]);
  
  // Enrich data with calculated fields
  const enrichedData = useMemo(() => {
    if (calculatedFields.length === 0) return data;
    
    return data.map(row => {
      const enrichedRow = { ...row };
      
      calculatedFields.forEach(field => {
        const formula = field.formula.replace(/\{([^}]+)\}/g, (_, fieldName) => {
          const fieldValue = row[fieldName];
          return isNaN(fieldValue) ? 0 : fieldValue;
        });
        
        try {
          enrichedRow[field.name] = new Function('return ' + formula)();
        } catch (e) {
          enrichedRow[field.name] = 0;
        }
      });
      
      return enrichedRow;
    });
  }, [data, calculatedFields]);
  
  // Calculate pivot table data
  const pivotData = useMemo(() => {
    // Need at least rows or columns to group by
    if (config.rows.length === 0 && config.columns.length === 0) {
      return { rows: [], columns: [], cells: {} };
    }

    // Group data by row and column dimensions
    const groupedData: any = {};
    const rowValues = new Set<string>();
    const colValues = new Set<string>();

    enrichedData.forEach(record => {
      // Build row key
      const rowKey = config.rows.map(field => record[field.id] || 'null').join('|');
      if (rowKey) rowValues.add(rowKey);

      // Build column key
      const colKey = config.columns.map(field => record[field.id] || 'null').join('|');
      if (colKey) colValues.add(colKey);

      // Initialize nested structure
      if (!groupedData[rowKey]) groupedData[rowKey] = {};
      if (!groupedData[rowKey][colKey]) groupedData[rowKey][colKey] = [];

      // Add record to the group
      groupedData[rowKey][colKey].push(record);
    });

    // Calculate aggregations
    const cells: any = {};
    
    rowValues.forEach(rowKey => {
      cells[rowKey] = {};
      colValues.forEach(colKey => {
        cells[rowKey][colKey] = {};
        const records = groupedData[rowKey]?.[colKey] || [];
        
        if (config.values.length === 0) {
          // Just count when no value fields specified
          cells[rowKey][colKey]['count'] = records.length;
        } else {
          // Calculate aggregation for each value field
          config.values.forEach(valueField => {
            const values = records.map(r => parseFloat(r[valueField.id]) || 0);
            
            switch (aggregator) {
              case 'Sum':
                cells[rowKey][colKey][valueField.id] = values.reduce((a, b) => a + b, 0);
                break;
              case 'Average':
                cells[rowKey][colKey][valueField.id] = values.length > 0 
                  ? values.reduce((a, b) => a + b, 0) / values.length 
                  : 0;
                break;
              case 'Count':
                cells[rowKey][colKey][valueField.id] = values.length;
                break;
              case 'CountDistinct':
                cells[rowKey][colKey][valueField.id] = new Set(records.map(r => r[valueField.id])).size;
                break;
              case 'Min':
                cells[rowKey][colKey][valueField.id] = values.length > 0 ? Math.min(...values) : 0;
                break;
              case 'Max':
                cells[rowKey][colKey][valueField.id] = values.length > 0 ? Math.max(...values) : 0;
                break;
              case 'Median':
                if (values.length > 0) {
                  const sorted = [...values].sort((a, b) => a - b);
                  const mid = Math.floor(sorted.length / 2);
                  cells[rowKey][colKey][valueField.id] = sorted.length % 2 === 0
                    ? (sorted[mid - 1] + sorted[mid]) / 2
                    : sorted[mid];
                } else {
                  cells[rowKey][colKey][valueField.id] = 0;
                }
                break;
              default:
                cells[rowKey][colKey][valueField.id] = values.length;
            }
          });
        }
      });
    });

    return {
      rows: Array.from(rowValues).sort(),
      columns: Array.from(colValues).sort(),
      cells
    };
  }, [enrichedData, config.rows, config.columns, config.values, aggregator]);

  // Get all available fields including calculated ones
  const getAllFields = (): Field[] => {
    return [...availableFields, ...calculatedFields];
  };
  
  // Get unused fields
  const getUnusedFields = () => {
    // Allow fields to be used multiple times
    return getAllFields();
  };
  
  // Validate formula
  const validateFormula = (formula: string): { isValid: boolean; error: string } => {
    try {
      // Check if formula contains valid field references
      const fieldPattern = /\{([^}]+)\}/g;
      const matches = formula.match(fieldPattern);
      
      if (matches) {
        const fieldNames = matches.map(m => m.slice(1, -1));
        const invalidFields = fieldNames.filter(name => 
          !availableFields.some(f => f.name === name || f.displayName === name || f.id === name)
        );
        
        if (invalidFields.length > 0) {
          return {
            isValid: false,
            error: `Unknown fields: ${invalidFields.join(', ')}`
          };
        }
      }
      
      // Basic syntax validation
      const testFormula = formula.replace(/\{([^}]+)\}/g, '1');
      try {
        new Function('return ' + testFormula)();
      } catch (e) {
        return {
          isValid: false,
          error: 'Invalid formula syntax'
        };
      }
      
      return { isValid: true, error: '' };
    } catch (e) {
      return { isValid: false, error: 'Invalid formula' };
    }
  };
  
  
  // Add calculated field
  const addCalculatedField = () => {
    const validation = validateFormula(formulaBuilder.formula);
    
    if (!formulaBuilder.name.trim()) {
      setFormulaBuilder(prev => ({ ...prev, error: 'Field name is required' }));
      return;
    }
    
    if (!validation.isValid) {
      setFormulaBuilder(prev => ({ ...prev, error: validation.error }));
      return;
    }
    
    // Check for duplicate names
    if (getAllFields().some(f => f.name === formulaBuilder.name)) {
      setFormulaBuilder(prev => ({ ...prev, error: 'Field name already exists' }));
      return;
    }
    
    // Extract dependencies
    const fieldPattern = /\{([^}]+)\}/g;
    const matches = formulaBuilder.formula.match(fieldPattern) || [];
    const dependencies = matches.map(m => m.slice(1, -1));
    
    const newField: CalculatedField = {
      id: `calc_${Date.now()}`,
      name: formulaBuilder.name,
      displayName: formulaBuilder.name,
      type: 'number',
      formula: formulaBuilder.formula,
      isCalculated: true,
      dependencies
    };
    
    setCalculatedFields(prev => [...prev, newField]);
    setFormulaBuilder({ name: '', formula: '', error: '' });
    setShowFormulaBuilder(false);
  };
  
  // Remove calculated field
  const removeCalculatedField = (fieldId: string) => {
    setCalculatedFields(prev => prev.filter(f => f.id !== fieldId));
    // Also remove from config if present
    setConfig(prev => ({
      ...prev,
      filters: prev.filters.filter(f => f.id !== fieldId),
      rows: prev.rows.filter(f => f.id !== fieldId),
      columns: prev.columns.filter(f => f.id !== fieldId),
      values: prev.values.filter(f => f.id !== fieldId)
    }));
  };
  
  // Drag and drop handlers
  const handleDragStart = (field: Field, from: string) => {
    draggedField.current = field;
    draggedFrom.current = from;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, to: string, index?: number) => {
    e.preventDefault();
    
    const field = draggedField.current;
    const from = draggedFrom.current;
    
    if (!field || !from) return;
    
    setConfig(prev => {
      const newConfig = { ...prev };
      
      // Remove from source
      if (from !== 'unused') {
        newConfig[from as keyof typeof newConfig] = (prev[from as keyof typeof prev] as Field[])
          .filter(f => f.id !== field.id);
      }
      
      // Add to target if not 'unused'
      if (to !== 'unused') {
        const targetArray = [...(newConfig[to as keyof typeof newConfig] as Field[])];
        
        // Remove if already exists
        const existingIndex = targetArray.findIndex(f => f.id === field.id);
        if (existingIndex !== -1) {
          targetArray.splice(existingIndex, 1);
        }
        
        // Insert at specific position or at end
        if (index !== undefined && index >= 0) {
          targetArray.splice(index, 0, field);
        } else {
          targetArray.push(field);
        }
        
        newConfig[to as keyof typeof newConfig] = targetArray as any;
      }
      
      return newConfig;
    });
    
    draggedField.current = null;
    draggedFrom.current = null;
  };

  // Render field pill
  const renderFieldPill = (field: Field, from: string) => {
    const removeField = () => {
      if ((field as any).isCalculated) {
        removeCalculatedField(field.id);
      } else if (from !== 'unused') {
        // Remove field from drop zone
        setConfig(prev => ({
          ...prev,
          [from]: prev[from as keyof typeof prev].filter((f: Field) => f.id !== field.id)
        }));
      }
    };

    return (
      <div
        key={field.id}
        className={`field-item-horizontal ${field.type}`}
        draggable
        onDragStart={() => handleDragStart(field, from)}
        onDragOver={(e) => {
          if (from !== 'unused') {
            e.preventDefault(); // Allow dropping on field pills in drop zones
          }
        }}
        onDrop={(e) => {
          if (from !== 'unused') {
            e.preventDefault();
            e.stopPropagation();
            // Find the index of this field and drop after it
            const config_key = from as keyof typeof config;
            const currentIndex = config[config_key].findIndex((f: Field) => f.id === field.id);
            handleDrop(e, from, currentIndex + 1);
          }
        }}
        onClick={(e) => {
          // Handle click on the X button (::after pseudo-element)
          if (from !== 'unused') {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const elementWidth = rect.width;
            
            // Check if click is in the right area where X button would be
            if (clickX > elementWidth - 20) {
              e.preventDefault();
              e.stopPropagation();
              removeField();
            }
          }
        }}
        title={field.displayName}
      >
        <span className="field-name">{field.displayName}</span>
        {(field as any).isCalculated && (
          <span className="calculated-badge">ƒ</span>
        )}
      </div>
    );
  };

  return (
    <div className="pivottable-ui" style={{ height, width }}>
      <div className="pivot-config-area">
        <div className="config-controls">
          <div className="aggregator-selector">
            <label>Aggregator:</label>
            <select value={aggregator} onChange={(e) => setAggregator(e.target.value)}>
              <option value="Count">Count</option>
              <option value="Sum">Sum</option>
              <option value="Average">Average</option>
              <option value="Min">Min</option>
              <option value="Max">Max</option>
              <option value="CountDistinct">Count Distinct</option>
              <option value="Median">Median</option>
            </select>
          </div>
          
          <button 
            className="add-calculated-field-btn"
            onClick={() => setShowFormulaBuilder(!showFormulaBuilder)}
          >
            + Add Calculated Field
          </button>
        </div>

        {showFormulaBuilder && (
          <div className="formula-builder">
            <h4>Create Calculated Field</h4>
            <div className="formula-inputs">
              <input
                type="text"
                placeholder="Field Name"
                value={formulaBuilder.name}
                onChange={(e) => setFormulaBuilder(prev => ({ ...prev, name: e.target.value, error: '' }))}
              />
              <input
                type="text"
                placeholder="Formula (e.g., {Sales} * 1.1)"
                value={formulaBuilder.formula}
                onChange={(e) => setFormulaBuilder(prev => ({ ...prev, formula: e.target.value, error: '' }))}
              />
              <button onClick={addCalculatedField}>Create</button>
              <button onClick={() => setShowFormulaBuilder(false)}>Cancel</button>
            </div>
            {formulaBuilder.error && (
              <div className="formula-error">{formulaBuilder.error}</div>
            )}
            <div className="formula-help">
              Use {'{'}fieldName{'}'} to reference fields. Supports: +, -, *, /, (), Math functions
            </div>
          </div>
        )}

        <div className="fields-bar">
          <div className="fields-container">
            {getUnusedFields().map(field => renderFieldPill(field, 'unused'))}
          </div>
        </div>

        <div className="pivot-grid-layout">
          <div className="drop-zone-filter">
            <div className="drop-zone-label">Filters</div>
            <div 
              className="field-drop-zone"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'filters')}
            >
              {config.filters.map((field, index) => (
                <React.Fragment key={field.id}>
                  <div
                    className="drop-indicator"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('drop-indicator-active');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('drop-indicator-active');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('drop-indicator-active');
                      handleDrop(e, 'filters', index);
                    }}
                  />
                  {renderFieldPill(field, 'filters')}
                </React.Fragment>
              ))}
              <div
                className="drop-indicator"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('drop-indicator-active');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('drop-indicator-active');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('drop-indicator-active');
                  handleDrop(e, 'filters', config.filters.length);
                }}
              />
            </div>
          </div>

          <div className="drop-zone-columns">
            <div className="drop-zone-label">Columns</div>
            <div 
              className="field-drop-zone"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'columns')}
            >
              {config.columns.map((field, index) => (
                <React.Fragment key={field.id}>
                  <div
                    className="drop-indicator"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('drop-indicator-active');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('drop-indicator-active');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('drop-indicator-active');
                      handleDrop(e, 'columns', index);
                    }}
                  />
                  {renderFieldPill(field, 'columns')}
                </React.Fragment>
              ))}
              <div
                className="drop-indicator"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('drop-indicator-active');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('drop-indicator-active');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('drop-indicator-active');
                  handleDrop(e, 'columns', config.columns.length);
                }}
              />
            </div>
          </div>

          <div className="drop-zone-rows">
            <div className="drop-zone-label">Rows</div>
            <div 
              className="field-drop-zone"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'rows')}
            >
              {config.rows.map(field => renderFieldPill(field, 'rows'))}
            </div>
          </div>

          <div className="drop-zone-values">
            <div className="drop-zone-label">Values</div>
            <div 
              className="field-drop-zone"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'values')}
            >
              {config.values.map((field, index) => (
                <React.Fragment key={field.id}>
                  <div
                    className="drop-indicator"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('drop-indicator-active');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('drop-indicator-active');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('drop-indicator-active');
                      handleDrop(e, 'values', index);
                    }}
                  />
                  {renderFieldPill(field, 'values')}
                </React.Fragment>
              ))}
              <div
                className="drop-indicator"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('drop-indicator-active');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('drop-indicator-active');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('drop-indicator-active');
                  handleDrop(e, 'values', config.values.length);
                }}
              />
            </div>
            <div className="pivot-table-area">
              {pivotData.rows.length > 0 || pivotData.columns.length > 0 ? (
                <table className="pivot-table-simple">
              <thead>
                <tr>
                  {/* Row header labels */}
                  {config.rows.map(field => (
                    <th key={field.id} className="row-header-label">
                      {field.displayName}
                    </th>
                  ))}
                  {/* Column headers */}
                  {pivotData.columns.length > 0 ? (
                    pivotData.columns.map(colValue => (
                      config.values.length > 0 ? (
                        config.values.map(valueField => (
                          <th key={`${colValue}-${valueField.id}`} className="column-header">
                            <div>{colValue}</div>
                            <div className="value-label">{valueField.displayName}</div>
                          </th>
                        ))
                      ) : (
                        <th key={colValue} className="column-header">
                          {colValue}
                        </th>
                      )
                    ))
                  ) : config.values.length > 0 ? (
                    config.values.map(valueField => (
                      <th key={valueField.id} className="column-header">
                        {valueField.displayName}
                      </th>
                    ))
                  ) : (
                    <th className="column-header">Count</th>
                  )}
                  {/* Row total header */}
                  {config.rows.length > 0 && config.columns.length > 0 && (
                    config.values.length > 0 ? (
                      config.values.map(valueField => (
                        <th key={`total-${valueField.id}`} className="column-header">
                          <div>Total</div>
                          <div className="value-label">{valueField.displayName}</div>
                        </th>
                      ))
                    ) : (
                      <th className="column-header">Total</th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {pivotData.rows.length > 0 ? (
                  pivotData.rows.map(rowValue => (
                    <tr key={rowValue}>
                      {/* Row headers */}
                      {config.rows.length > 0 && (
                        <td className="row-header">
                          {rowValue}
                        </td>
                      )}
                      {/* Data cells */}
                      {pivotData.columns.length > 0 ? (
                        pivotData.columns.map(colValue => (
                          config.values.length > 0 ? (
                            config.values.map(valueField => (
                              <td key={`${rowValue}-${colValue}-${valueField.id}`} className="data-cell">
                                {pivotData.cells[rowValue]?.[colValue]?.[valueField.id]?.toLocaleString() || 0}
                              </td>
                            ))
                          ) : (
                            <td key={`${rowValue}-${colValue}-count`} className="data-cell">
                              {pivotData.cells[rowValue]?.[colValue]?.count?.toLocaleString() || 0}
                            </td>
                          )
                        ))
                      ) : (
                        config.values.length > 0 ? (
                          config.values.map(valueField => {
                            const total = Object.values(pivotData.cells[rowValue] || {}).reduce((sum: number, col: any) => {
                              return sum + (col[valueField.id] || 0);
                            }, 0);
                            return (
                              <td key={valueField.id} className="data-cell">
                                {total.toLocaleString()}
                              </td>
                            );
                          })
                        ) : (
                          <td className="data-cell">
                            {Object.values(pivotData.cells[rowValue] || {}).reduce((sum: number, col: any) => {
                              return sum + (col.count || 0);
                            }, 0).toLocaleString()}
                          </td>
                        )
                      )}
                      {/* Row grand total */}
                      {config.columns.length > 0 && config.values.map(valueField => {
                        const rowTotal = pivotData.columns.reduce((sum, colValue) => {
                          return sum + (pivotData.cells[rowValue]?.[colValue]?.[valueField.id] || 0);
                        }, 0);
                        return (
                          <td key={`${rowValue}-total-${valueField.id}`} className="data-cell grand-total">
                            {rowTotal.toLocaleString()}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  // Single row when no row fields
                  <tr>
                    {pivotData.columns.map(colValue => (
                      config.values.map(valueField => {
                        const total = data.filter(record => {
                          return config.columns.every(field => {
                            const fieldName = calculatedFields.some(cf => cf.id === field.id) ? field.name : field.id;
                            return record[fieldName] == colValue;
                          });
                        }).reduce((sum, record) => {
                          const fieldName = calculatedFields.some(cf => cf.id === valueField.id) ? valueField.name : valueField.id;
                          return sum + (record[fieldName] || 0);
                        }, 0);
                        return (
                          <td key={`${colValue}-${valueField.id}`} className="data-cell">
                            {total.toLocaleString()}
                          </td>
                        );
                      })
                    ))}
                  </tr>
                )}
                {/* Grand total row */}
                {config.rows.length > 0 && (
                  <tr className="grand-total-row">
                    <td className="row-header grand-total">
                      Grand Total
                    </td>
                    {pivotData.columns.length > 0 ? (
                      pivotData.columns.map(colValue => (
                        config.values.map(valueField => {
                          const colTotal = pivotData.rows.reduce((sum, rowValue) => {
                            return sum + (pivotData.cells[rowValue]?.[colValue]?.[valueField.id] || 0);
                          }, 0);
                          return (
                            <td key={`grand-${colValue}-${valueField.id}`} className="data-cell">
                              {colTotal.toLocaleString()}
                            </td>
                          );
                        })
                      ))
                    ) : (
                      config.values.map(valueField => {
                        const grandTotal = pivotData.rows.reduce((sum, rowValue) => {
                          return sum + Object.values(pivotData.cells[rowValue] || {}).reduce((colSum: number, col: any) => {
                            return colSum + (col[valueField.id] || 0);
                          }, 0);
                        }, 0);
                        return (
                          <td key={`grand-total-${valueField.id}`} className="data-cell">
                            {grandTotal.toLocaleString()}
                          </td>
                        );
                      })
                    )}
                    {/* Grand grand total */}
                    {config.columns.length > 0 && config.values.map(valueField => {
                      const grandGrandTotal = pivotData.rows.reduce((sum, rowValue) => {
                        return sum + pivotData.columns.reduce((colSum, colValue) => {
                          return colSum + (pivotData.cells[rowValue]?.[colValue]?.[valueField.id] || 0);
                        }, 0);
                      }, 0);
                      return (
                        <td key={`grand-grand-${valueField.id}`} className="data-cell grand-total">
                          {grandGrandTotal.toLocaleString()}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="pivot-empty-state">
              <p>Drag fields to Rows, Columns, and Values to create a pivot table</p>
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PivotTableUI;