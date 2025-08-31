/**
 * Performance Monitoring Component
 * Displays real-time performance metrics and memory usage
 */

import React, { useState, useEffect, useMemo } from 'react';
import './PerformanceStats.css';

export interface PerformanceMetrics {
  memoryUsage?: number;
  renderTime?: number;
  rowsRendered?: number;
  columnsRendered?: number;
  totalDataSize?: number;
  scrollPosition?: { x: number; y: number };
}

export interface PerformanceStatsProps {
  metrics: PerformanceMetrics;
  dataCount: number;
  isVirtualScrolling?: boolean;
  onToggleStats?: () => void;
  className?: string;
}

export const PerformanceStats: React.FC<PerformanceStatsProps> = ({
  metrics,
  dataCount,
  isVirtualScrolling = false,
  onToggleStats,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceMetrics[]>([]);

  // Track performance metrics over time
  useEffect(() => {
    const timestamp = Date.now();
    setPerformanceHistory(prev => [
      ...prev.slice(-9), // Keep last 10 entries
      { ...metrics, timestamp } as PerformanceMetrics & { timestamp: number }
    ]);
  }, [metrics]);

  // Calculate performance insights
  const performanceInsights = useMemo(() => {
    const insights = [];
    
    if (dataCount > 10000 && !isVirtualScrolling) {
      insights.push({
        type: 'warning',
        message: 'Large dataset detected. Enable virtual scrolling for better performance.'
      });
    }
    
    if (metrics.memoryUsage && metrics.memoryUsage > 100 * 1024 * 1024) { // 100MB
      insights.push({
        type: 'warning', 
        message: 'High memory usage detected. Consider data sampling or pagination.'
      });
    }
    
    if (metrics.renderTime && metrics.renderTime > 100) {
      insights.push({
        type: 'error',
        message: 'Slow rendering detected. Performance optimization recommended.'
      });
    }
    
    if (isVirtualScrolling && dataCount < 1000) {
      insights.push({
        type: 'info',
        message: 'Virtual scrolling may not be necessary for this dataset size.'
      });
    }
    
    return insights;
  }, [metrics, dataCount, isVirtualScrolling]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getPerformanceLevel = () => {
    const warningCount = performanceInsights.filter(i => i.type === 'warning').length;
    const errorCount = performanceInsights.filter(i => i.type === 'error').length;
    
    if (errorCount > 0) return 'poor';
    if (warningCount > 0) return 'moderate';
    return 'good';
  };

  return (
    <div className={`performance-stats ${className}`}>
      <div 
        className={`performance-header ${getPerformanceLevel()}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="performance-indicator">
          <span className="indicator-dot"></span>
          <span className="performance-label">
            Performance: {getPerformanceLevel().toUpperCase()}
          </span>
        </div>
        
        <div className="performance-summary">
          {isVirtualScrolling && <span className="virtual-badge">⚡ Virtual</span>}
          <span>Rows: {dataCount.toLocaleString()}</span>
          {metrics.memoryUsage && (
            <span>Memory: {formatBytes(metrics.memoryUsage)}</span>
          )}
        </div>
        
        <button 
          className="expand-button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>
      
      {isExpanded && (
        <div className="performance-details">
          <div className="metrics-grid">
            <div className="metric-card">
              <label>Render Time</label>
              <value>{metrics.renderTime ? `${metrics.renderTime}ms` : 'N/A'}</value>
            </div>
            
            <div className="metric-card">
              <label>Memory Usage</label>
              <value>{metrics.memoryUsage ? formatBytes(metrics.memoryUsage) : 'N/A'}</value>
            </div>
            
            <div className="metric-card">
              <label>Visible Rows</label>
              <value>{metrics.rowsRendered || 'All'}</value>
            </div>
            
            <div className="metric-card">
              <label>Visible Columns</label>
              <value>{metrics.columnsRendered || 'All'}</value>
            </div>
            
            <div className="metric-card">
              <label>Data Size</label>
              <value>{metrics.totalDataSize ? formatBytes(metrics.totalDataSize) : 'N/A'}</value>
            </div>
            
            <div className="metric-card">
              <label>Scroll Position</label>
              <value>
                {metrics.scrollPosition 
                  ? `${metrics.scrollPosition.x}, ${metrics.scrollPosition.y}` 
                  : '0, 0'
                }
              </value>
            </div>
          </div>
          
          {performanceInsights.length > 0 && (
            <div className="performance-insights">
              <h4>Performance Insights</h4>
              {performanceInsights.map((insight, index) => (
                <div key={index} className={`insight insight-${insight.type}`}>
                  <span className="insight-icon">
                    {insight.type === 'error' ? '⚠️' : insight.type === 'warning' ? '🔶' : 'ℹ️'}
                  </span>
                  {insight.message}
                </div>
              ))}
            </div>
          )}
          
          {onToggleStats && (
            <div className="performance-actions">
              <button className="action-button" onClick={onToggleStats}>
                Detailed Stats
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PerformanceStats;