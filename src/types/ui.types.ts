import { PivotCell, PivotConfiguration } from './pivot.types';
import { DataRow } from './data.types';

export interface VirtualScrollConfig {
  enabled: boolean;
  rowHeight: number;
  columnWidth: number;
  overscan: number;
  threshold: number;
}

export interface GridDimensions {
  width: number;
  height: number;
  rowCount: number;
  columnCount: number;
}

export interface ScrollPosition {
  x: number;
  y: number;
}

export interface CellPosition {
  row: number;
  column: number;
}

export interface SelectionRange {
  start: CellPosition;
  end: CellPosition;
}

export interface GridSelection {
  ranges: SelectionRange[];
  activeCell?: CellPosition;
}

export interface ContextMenuConfig {
  enabled: boolean;
  items: ContextMenuItem[];
}

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  action: (context: ContextMenuContext) => void;
  visible?: (context: ContextMenuContext) => boolean;
  disabled?: (context: ContextMenuContext) => boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
}

export interface ContextMenuContext {
  cell?: PivotCell;
  position: CellPosition;
  selection: GridSelection;
  data: DataRow[];
}

export interface TooltipConfig {
  enabled: boolean;
  showDelay: number;
  hideDelay: number;
  formatter?: (cell: PivotCell) => string;
}

export interface ResizableColumn {
  key: string;
  width: number;
  minWidth: number;
  maxWidth: number;
  resizable: boolean;
}

export interface DragDropConfig {
  enabled: boolean;
  allowReorder: boolean;
  allowGrouping: boolean;
  onFieldMove?: (fieldId: string, from: string, to: string, index: number) => void;
}

export interface GridFeatures {
  virtualScrolling: VirtualScrollConfig;
  selection: boolean;
  contextMenu: ContextMenuConfig;
  tooltip: TooltipConfig;
  columnResize: boolean;
  rowResize: boolean;
  dragDrop: DragDropConfig;
  export: boolean;
  search: boolean;
  sorting: boolean;
  filtering: boolean;
}

export interface GridEventHandlers {
  onCellClick?: (cell: PivotCell, position: CellPosition) => void;
  onCellDoubleClick?: (cell: PivotCell, position: CellPosition) => void;
  onCellHover?: (cell: PivotCell, position: CellPosition) => void;
  onSelectionChange?: (selection: GridSelection) => void;
  onScroll?: (position: ScrollPosition) => void;
  onColumnResize?: (columnKey: string, newWidth: number) => void;
  onRowResize?: (rowIndex: number, newHeight: number) => void;
  onConfigurationChange?: (config: PivotConfiguration) => void;
}