/**
 * Virtual Scrolling Table Component
 * Renders only visible rows/columns to handle large datasets efficiently
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './VirtualTable.css';

export interface VirtualTableColumn {
  key: string;
  title: string;
  width?: number;
  render?: (value: any, record: any, index: number) => React.ReactNode;
}

export interface VirtualTableProps {
  data: any[];
  columns: VirtualTableColumn[];
  rowHeight?: number;
  containerHeight?: number;
  containerWidth?: number;
  overscan?: number;
  onScroll?: (scrollLeft: number, scrollTop: number) => void;
  className?: string;
}

interface ViewportInfo {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  scrollTop: number;
  scrollLeft: number;
}

export const VirtualTable: React.FC<VirtualTableProps> = ({
  data,
  columns,
  rowHeight = 35,
  containerHeight = 400,
  containerWidth = 800,
  overscan = 5,
  onScroll,
  className = ''
}) => {
  const [viewport, setViewport] = useState<ViewportInfo>({
    startRow: 0,
    endRow: 0,
    startCol: 0,
    endCol: 0,
    scrollTop: 0,
    scrollLeft: 0
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Calculate column positions and widths
  const columnInfo = useMemo(() => {
    const defaultWidth = 120;
    let currentLeft = 0;
    
    return columns.map(col => {
      const width = col.width || defaultWidth;
      const info = {
        ...col,
        width,
        left: currentLeft,
        right: currentLeft + width
      };
      currentLeft += width;
      return info;
    });
  }, [columns]);

  const totalWidth = columnInfo.reduce((sum, col) => sum + col.width, 0);
  const totalHeight = data.length * rowHeight;

  // Calculate visible viewport
  const calculateViewport = useCallback((scrollTop: number, scrollLeft: number) => {
    const visibleRowCount = Math.ceil(containerHeight / rowHeight);
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endRow = Math.min(data.length - 1, startRow + visibleRowCount + overscan * 2);

    // Calculate visible columns
    const startCol = Math.max(0, 
      columnInfo.findIndex(col => col.right > scrollLeft) - overscan
    );
    const endCol = Math.min(columnInfo.length - 1,
      columnInfo.findIndex(col => col.left > scrollLeft + containerWidth) + overscan
    );

    return {
      startRow,
      endRow: Math.max(startRow, endRow),
      startCol,
      endCol: endCol === -1 ? columnInfo.length - 1 : Math.max(startCol, endCol),
      scrollTop,
      scrollLeft
    };
  }, [data.length, rowHeight, containerHeight, containerWidth, overscan, columnInfo]);

  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    const newViewport = calculateViewport(scrollTop, scrollLeft);
    setViewport(newViewport);
    
    // Sync header scroll
    if (headerRef.current) {
      headerRef.current.scrollLeft = scrollLeft;
    }
    
    if (onScroll) {
      onScroll(scrollLeft, scrollTop);
    }
  }, [calculateViewport, onScroll]);

  // Initialize viewport
  useEffect(() => {
    setViewport(calculateViewport(0, 0));
  }, [calculateViewport]);

  // Render visible rows
  const visibleRows = useMemo(() => {
    const rows = [];
    
    for (let rowIndex = viewport.startRow; rowIndex <= viewport.endRow; rowIndex++) {
      const record = data[rowIndex];
      if (!record) continue;

      const cells = [];
      for (let colIndex = viewport.startCol; colIndex <= viewport.endCol; colIndex++) {
        const column = columnInfo[colIndex];
        if (!column) continue;

        const value = record[column.key];
        const cellContent = column.render 
          ? column.render(value, record, rowIndex)
          : value?.toString() || '';

        cells.push(
          <div
            key={`${rowIndex}-${colIndex}`}
            className="virtual-cell"
            style={{
              position: 'absolute',
              left: column.left,
              width: column.width,
              height: rowHeight,
              lineHeight: `${rowHeight}px`,
              padding: '0 8px',
              borderRight: '1px solid #ddd',
              borderBottom: '1px solid #ddd',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'white'
            }}
          >
            {cellContent}
          </div>
        );
      }

      rows.push(
        <div
          key={rowIndex}
          className="virtual-row"
          style={{
            position: 'absolute',
            top: rowIndex * rowHeight,
            left: 0,
            width: totalWidth,
            height: rowHeight
          }}
        >
          {cells}
        </div>
      );
    }

    return rows;
  }, [viewport, data, columnInfo, rowHeight, totalWidth]);

  // Render header
  const header = useMemo(() => {
    const headerCells = [];
    
    for (let colIndex = viewport.startCol; colIndex <= viewport.endCol; colIndex++) {
      const column = columnInfo[colIndex];
      if (!column) continue;

      headerCells.push(
        <div
          key={colIndex}
          className="virtual-header-cell"
          style={{
            position: 'absolute',
            left: column.left,
            width: column.width,
            height: rowHeight,
            lineHeight: `${rowHeight}px`,
            padding: '0 8px',
            borderRight: '1px solid #ddd',
            borderBottom: '2px solid #999',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            background: '#f5f5f5',
            fontWeight: 'bold'
          }}
        >
          {column.title}
        </div>
      );
    }

    return (
      <div
        ref={headerRef}
        className="virtual-header"
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          width: containerWidth,
          height: rowHeight,
          overflow: 'hidden',
          zIndex: 10,
          background: '#f5f5f5'
        }}
      >
        <div
          style={{
            position: 'relative',
            width: totalWidth,
            height: rowHeight
          }}
        >
          {headerCells}
        </div>
      </div>
    );
  }, [viewport.startCol, viewport.endCol, columnInfo, rowHeight, totalWidth, containerWidth]);

  return (
    <div className={`virtual-table ${className}`}>
      {/* Performance Stats */}
      <div className="virtual-stats">
        Rendering {viewport.endRow - viewport.startRow + 1} of {data.length} rows, 
        {viewport.endCol - viewport.startCol + 1} of {columns.length} columns
        {viewport.scrollTop > 0 && ` (scroll: ${Math.round(viewport.scrollTop)}px)`}
      </div>

      {/* Header */}
      {header}

      {/* Scrollable Content */}
      <div
        ref={containerRef}
        className="virtual-container"
        style={{
          width: containerWidth,
          height: containerHeight,
          overflow: 'auto',
          position: 'relative',
          border: '1px solid #ddd'
        }}
        onScroll={handleScroll}
      >
        {/* Virtual content area */}
        <div
          className="virtual-content"
          style={{
            width: totalWidth,
            height: totalHeight,
            position: 'relative'
          }}
        >
          {/* Visible rows */}
          {visibleRows}
        </div>
      </div>
    </div>
  );
};

export default VirtualTable;