/**
 * Report utilities for saving and loading pivot configurations
 */

export interface SavedReport {
  id: string;
  name: string;
  description?: string;
  config: any;
  filters?: any[];
  conditionalFormats?: any[];
  chartSettings?: any;
  createdAt: string;
  updatedAt: string;
}

// Save report to localStorage
export const saveReport = (report: Omit<SavedReport, 'id' | 'createdAt' | 'updatedAt'>): SavedReport => {
  const savedReport: SavedReport = {
    ...report,
    id: `report_${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Get existing reports
  const reports = getReports();
  reports.push(savedReport);
  
  // Save to localStorage
  localStorage.setItem('pivotReports', JSON.stringify(reports));
  
  return savedReport;
};

// Load report from localStorage
export const loadReport = (reportId: string): SavedReport | null => {
  const reports = getReports();
  return reports.find(r => r.id === reportId) || null;
};

// Get all saved reports
export const getReports = (): SavedReport[] => {
  const reportsJson = localStorage.getItem('pivotReports');
  return reportsJson ? JSON.parse(reportsJson) : [];
};

// Update existing report
export const updateReport = (reportId: string, updates: Partial<SavedReport>): boolean => {
  const reports = getReports();
  const reportIndex = reports.findIndex(r => r.id === reportId);
  
  if (reportIndex === -1) return false;
  
  reports[reportIndex] = {
    ...reports[reportIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  localStorage.setItem('pivotReports', JSON.stringify(reports));
  return true;
};

// Delete report
export const deleteReport = (reportId: string): boolean => {
  const reports = getReports();
  const filteredReports = reports.filter(r => r.id !== reportId);
  
  if (filteredReports.length === reports.length) return false;
  
  localStorage.setItem('pivotReports', JSON.stringify(filteredReports));
  return true;
};

// Export report to JSON file
export const exportReport = (report: SavedReport) => {
  const dataStr = JSON.stringify(report, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Import report from JSON file
export const importReport = (file: File): Promise<SavedReport> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const reportData = JSON.parse(e.target?.result as string);
        const importedReport = {
          ...reportData,
          id: `report_${Date.now()}`,
          updatedAt: new Date().toISOString()
        };
        
        // Save to localStorage
        const reports = getReports();
        reports.push(importedReport);
        localStorage.setItem('pivotReports', JSON.stringify(reports));
        
        resolve(importedReport);
      } catch (error) {
        reject(new Error('Invalid report file format'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

// Clear all reports
export const clearAllReports = (): void => {
  localStorage.removeItem('pivotReports');
};

// Get recent reports
export const getRecentReports = (limit: number = 5): SavedReport[] => {
  const reports = getReports();
  return reports
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
};