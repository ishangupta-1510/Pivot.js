export interface PerformanceMetrics {
  renderTime?: number;
  memoryUsage?: number;
  totalDataSize?: number;
  virtualizedRows?: number;
  virtualizedColumns?: number;
  scrollPosition?: { x: number; y: number };
  fps?: number;
  updateCount?: number;
  lastUpdateTime?: number;
}

export interface PerformanceBenchmark {
  operation: string;
  duration: number;
  dataSize: number;
  timestamp: Date;
  memoryBefore: number;
  memoryAfter: number;
  cpuUsage?: number;
}

export interface PerformanceThreshold {
  renderTime: number;
  memoryUsage: number;
  maxRows: number;
  maxColumns: number;
  scrollLatency: number;
}

export interface OptimizationConfig {
  enableVirtualization: boolean;
  enableMemoization: boolean;
  enableLazyLoading: boolean;
  enableDataCaching: boolean;
  enableWebWorkers: boolean;
  chunkSize: number;
  debounceDelay: number;
  throttleDelay: number;
}

export interface MemoryProfile {
  totalHeapSize: number;
  usedHeapSize: number;
  heapSizeLimit: number;
  componentMemory: number;
  dataMemory: number;
  renderMemory: number;
}