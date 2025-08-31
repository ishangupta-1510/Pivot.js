import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import PivotTableUI from './components/NativePivotGrid/PivotTableUI';
import { parseCSVStreaming, StreamingParserOptions, ProgressInfo } from './utils/streamingCSVParser';
import VirtualTable, { VirtualTableColumn } from './components/VirtualScrolling/VirtualTable';
import PerformanceStats, { PerformanceMetrics } from './components/PerformanceMonitor/PerformanceStats';
import { FileUpload } from './components/FileUpload/FileUpload';
import { DashboardManager } from './components/DashboardManager/DashboardManager';
import config from './config/environment';
import { apiService } from './services/api.service';
import { websocketService } from './services/websocket.service';
import './App.css';

// Sample data generator
const generateSampleData = (count: number = 100) => {
  const products = ['Laptop', 'Phone', 'Tablet', 'Monitor', 'Keyboard', 'Mouse', 'Headphones'];
  const categories = ['Electronics', 'Accessories', 'Computers', 'Audio'];
  const regions = ['North', 'South', 'East', 'West', 'Central'];
  const years = [2021, 2022, 2023, 2024];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      id: i + 1,
      product: products[Math.floor(Math.random() * products.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      region: regions[Math.floor(Math.random() * regions.length)],
      year: years[Math.floor(Math.random() * years.length)],
      quarter: quarters[Math.floor(Math.random() * quarters.length)],
      sales: Math.round(Math.random() * 100000) / 100,
      profit: Math.round(Math.random() * 20000) / 100,
      quantity: Math.floor(Math.random() * 1000) + 1,
      cost: Math.round(Math.random() * 50000) / 100,
      discount: Math.round(Math.random() * 5000) / 100,
      date: new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
    });
  }
  return data;
};

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState(() => generateSampleData(100));
  
  const [fileName, setFileName] = useState<string>('Sample Data');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [useVirtualScrolling, setUseVirtualScrolling] = useState(false);
  const [estimatedMemoryUsage, setEstimatedMemoryUsage] = useState<number>(0);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({});
  const [renderTime, setRenderTime] = useState<number>(0);
  const [useBackend, setUseBackend] = useState(config.useBackend);
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pivotConfig, setPivotConfig] = useState<any>(null);
  const [showDashboardManager, setShowDashboardManager] = useState(false);

  // Show dashboard manager when backend connects - DISABLED for now
  // useEffect(() => {
  //   if (config.useBackend && backendStatus === 'connected') {
  //     setShowDashboardManager(true);
  //   } else if (!config.useBackend || backendStatus === 'disconnected') {
  //     setShowDashboardManager(false);
  //   }
  // }, [backendStatus, config.useBackend]);

  // Check backend health on mount
  useEffect(() => {
    if (config.useBackend) {
      checkBackendHealth();
      
      // Setup WebSocket if enabled
      if (config.websocket.enabled) {
        websocketService.connect();
        
        websocketService.on('connected', () => {
          setBackendStatus('connected');
          console.log('Connected to backend WebSocket');
        });
        
        websocketService.on('disconnected', () => {
          setBackendStatus('disconnected');
        });
        
        return () => {
          websocketService.disconnect();
        };
      }
    }
  }, []);

  // Check backend health
  const checkBackendHealth = async () => {
    setBackendStatus('checking');
    const health = await apiService.checkHealth();
    
    if (health && health.status === 'healthy') {
      setBackendStatus('connected');
      console.log('Backend is healthy:', health);
    } else {
      setBackendStatus('disconnected');
      console.warn('Backend is not available. Falling back to frontend processing.');
      setUseBackend(false);
    }
  };

  // Handle data load from FileUpload component
  const handleDataLoad = (newData: any[]) => {
    setData(newData);
    setFileName('Uploaded CSV');
    setShowUploadDialog(false);
    
    // Auto-enable virtual scrolling for large datasets
    if (newData.length > 10000) {
      setUseVirtualScrolling(true);
    }
  };

  // Handle backend job start
  const handleBackendJobStart = (jobId: string) => {
    setCurrentJobId(jobId);
    console.log('Backend job started:', jobId);
  };

  // Handle backend job completion
  const handleBackendJobComplete = async (datasetId: string) => {
    console.log('Backend job completed. Dataset ID:', datasetId);
    setCurrentJobId(null);
    
    // TODO: Load dataset from backend
    // For now, we'll just show a success message
    alert(`Dataset processed successfully! ID: ${datasetId}`);
    setShowUploadDialog(false);
  };

  // Dashboard Manager handlers
  const handleLoadDashboard = useCallback((savedConfig: any) => {
    setPivotConfig(savedConfig);
    setShowDashboardManager(false);
    setUseVirtualScrolling(false); // Show pivot table when loading dashboard
    // The configuration will be applied when new data is loaded
  }, []);

  const handleCreateNewDashboard = useCallback(() => {
    setPivotConfig(null);
    setData(generateSampleData(100));
    setFileName('New Dashboard');
    setShowDashboardManager(false);
    setUseVirtualScrolling(false); // Show pivot table for new dashboard
  }, []);

  const handlePivotConfigChange = useCallback((config: any) => {
    setPivotConfig(config);
  }, []);

  // Parse CSV text to data array
  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index] || '';
        // Try to parse as number
        const numValue = parseFloat(value);
        row[header] = isNaN(numValue) ? value : numValue;
      });
      
      data.push(row);
    }
    
    return data;
  };

  // Handle file upload with streaming parser
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    setFileName(file.name);
    setProgress(null);
    
    // Auto-enable virtual scrolling for large files (>5MB)
    const shouldUseVirtualScrolling = file.size > 5 * 1024 * 1024;
    if (shouldUseVirtualScrolling && !useVirtualScrolling) {
      setUseVirtualScrolling(true);
      console.log('Large file detected. Enabling virtual scrolling for better performance.');
    }
    
    try {
      const options: StreamingParserOptions = {
        chunkSize: 64 * 1024, // 64KB chunks
        maxRows: 100000, // Limit for UI performance
        sampleRate: file.size > 50 * 1024 * 1024 ? 0.1 : 1, // Sample 10% for very large files
        onProgress: (progressInfo: ProgressInfo) => {
          setProgress(progressInfo);
          if (progressInfo.memoryUsage) {
            setEstimatedMemoryUsage(progressInfo.memoryUsage);
          }
        }
      };
      
      const parsedData = await parseCSVStreaming(file, options);
      
      if (parsedData.length > 0) {
        setData(parsedData);
        console.log(`Loaded ${parsedData.length} rows from ${file.name}`);
        
        // Show performance warning for large datasets
        if (parsedData.length > 10000) {
          console.warn(`Large dataset loaded (${parsedData.length} rows). Consider using virtual scrolling for better performance.`);
        }
      } else {
        alert('No data found in the CSV file');
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('Error parsing CSV file. Please check the file format.');
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  // Trigger file input
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Load sample data
  const handleLoadSampleData = () => {
    setData(generateSampleData(1000));
    setFileName('Sample Data (1000 rows)');
    setUseVirtualScrolling(false); // Reset for sample data
  };
  
  // Generate large sample data for testing
  const handleLoadLargeSampleData = () => {
    setData(generateSampleData(50000));
    setFileName('Large Sample Data (50,000 rows)');
    setUseVirtualScrolling(true);
  };
  
  // Toggle virtual scrolling
  const handleToggleVirtualScrolling = () => {
    setUseVirtualScrolling(!useVirtualScrolling);
  };
  
  // Create columns for virtual table
  const virtualTableColumns: VirtualTableColumn[] = useMemo(() => 
    Object.keys(data[0] || {}).map(key => ({
      key,
      title: key.charAt(0).toUpperCase() + key.slice(1),
      width: key === 'id' ? 80 : key.includes('date') ? 150 : 120,
      render: (value) => {
        if (value instanceof Date) {
          return value.toLocaleDateString();
        }
        if (typeof value === 'number') {
          return value.toLocaleString();
        }
        return String(value);
      }
    })), [data]
  );

  // Performance monitoring callback
  const handleVirtualTableScroll = useCallback((scrollLeft: number, scrollTop: number) => {
    setPerformanceMetrics(prev => ({
      ...prev,
      scrollPosition: { x: scrollLeft, y: scrollTop }
    }));
  }, []);

  // Calculate data size estimate
  const estimatedDataSize = useMemo(() => {
    if (data.length === 0) return 0;
    const sampleRow = JSON.stringify(data[0]);
    return sampleRow.length * data.length;
  }, [data]);

  // Update performance metrics when data changes
  useMemo(() => {
    const startTime = performance.now();
    
    setPerformanceMetrics({
      memoryUsage: estimatedMemoryUsage || estimatedDataSize,
      totalDataSize: estimatedDataSize,
      renderTime: renderTime
    });
    
    const endTime = performance.now();
    setRenderTime(endTime - startTime);
  }, [data, estimatedMemoryUsage, estimatedDataSize, renderTime]);

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-icon">📊</div>
            <div className="logo-text">
              <h1 className="app-title">PivotTable.js</h1>
              <p className="tagline">Interactive Pivot Table</p>
            </div>
          </div>
        </div>
      </header>

      <div className="app-toolbar">
        <div className="toolbar-section">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          {config.useBackend ? (
            <button 
              onClick={() => setShowUploadDialog(true)}
              disabled={isLoading}
              className="upload-button"
            >
              📁 {isLoading ? 'Loading...' : 'Upload CSV'}
            </button>
          ) : (
            <button 
              onClick={handleUploadClick}
              disabled={isLoading}
              className="upload-button"
            >
              📁 {isLoading ? 'Loading...' : 'Upload CSV'}
            </button>
          )}
          <button 
            onClick={handleLoadSampleData}
            className="sample-button"
          >
            📊 Sample Data
          </button>
          <button 
            onClick={handleLoadLargeSampleData}
            className="sample-button"
          >
            🚀 Large Sample (50K)
          </button>
          <button 
            onClick={handleToggleVirtualScrolling}
            className={`toggle-button ${useVirtualScrolling ? 'active' : ''}`}
          >
            ⚡ Virtual Scroll: {useVirtualScrolling ? 'ON' : 'OFF'}
          </button>
          {config.useBackend && backendStatus === 'connected' && (
            <button 
              onClick={() => setShowDashboardManager(!showDashboardManager)}
              className={`toggle-button ${showDashboardManager ? 'active' : ''}`}
            >
              📊 Dashboards
            </button>
          )}
          {fileName && (
            <span className="file-name">📄 {fileName}</span>
          )}
        </div>
        
        <div className="data-info">
          <span>Rows: {data.length.toLocaleString()}</span>
          <span>Fields: {Object.keys(data[0] || {}).length}</span>
          {estimatedMemoryUsage > 0 && (
            <span>Memory: {Math.round(estimatedMemoryUsage / 1024 / 1024)}MB</span>
          )}
          {useVirtualScrolling && <span className="virtual-indicator">⚡ Virtual</span>}
          {config.useBackend && (
            <span className={`backend-status ${backendStatus}`}>
              🔌 Backend: {backendStatus}
            </span>
          )}
        </div>
      </div>

      <PerformanceStats
        metrics={performanceMetrics}
        dataCount={data.length}
        isVirtualScrolling={useVirtualScrolling}
      />

      {progress && (
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
          <div className="progress-info">
            <span>Loading: {progress.percentage}%</span>
            <span>Rows: {progress.rowsProcessed.toLocaleString()}</span>
            {progress.estimatedRowsTotal && (
              <span>Est. Total: {progress.estimatedRowsTotal.toLocaleString()}</span>
            )}
            {progress.memoryUsage && (
              <span>Memory: {Math.round(progress.memoryUsage / 1024 / 1024)}MB</span>
            )}
          </div>
        </div>
      )}
      
      {showUploadDialog && config.useBackend && (
        <div className="upload-dialog-overlay" onClick={() => setShowUploadDialog(false)}>
          <div className="upload-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h2>Upload CSV File</h2>
              <button 
                className="dialog-close"
                onClick={() => setShowUploadDialog(false)}
              >
                ✕
              </button>
            </div>
            <FileUpload
              onDataLoad={handleDataLoad}
              onBackendJobStart={handleBackendJobStart}
              onBackendJobComplete={handleBackendJobComplete}
            />
          </div>
        </div>
      )}

      {showDashboardManager && (
        <DashboardManager
          currentConfig={pivotConfig}
          currentData={data}
          onLoadDashboard={handleLoadDashboard}
          onCreateNew={handleCreateNewDashboard}
        />
      )}

      <div className="app-content">
        {useVirtualScrolling ? (
          <div className="virtual-table-container">
            <VirtualTable
              data={data}
              columns={virtualTableColumns}
              containerHeight={600}
              containerWidth={Math.min(window.innerWidth - 40, 1200)}
              rowHeight={35}
              overscan={5}
              onScroll={handleVirtualTableScroll}
            />
          </div>
        ) : (
          <PivotTableUI
            data={data}
            height="100%"
            width="100%"
            onChange={handlePivotConfigChange}
            config={pivotConfig}
          />
        )}
      </div>
    </div>
  );
}

export default App;