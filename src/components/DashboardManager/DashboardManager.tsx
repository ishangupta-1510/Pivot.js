import React, { useState, useEffect } from 'react';
import config from '../../config/environment';
import { apiService } from '../../services/api.service';
import './DashboardManager.css';

interface Dashboard {
  id: string;
  name: string;
  description?: string;
  config: any;
  expected_fields?: any[];
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
  access_count?: number;
}

interface DashboardManagerProps {
  currentConfig?: any;
  currentData?: any[];
  onLoadDashboard: (config: any) => void;
  onCreateNew: () => void;
}

export const DashboardManager: React.FC<DashboardManagerProps> = ({
  currentConfig,
  currentData,
  onLoadDashboard,
  onCreateNew
}) => {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedDashboard, setSelectedDashboard] = useState<Dashboard | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Load dashboards on mount
  useEffect(() => {
    if (config.useBackend) {
      loadDashboards();
    }
  }, []);

  const loadDashboards = async () => {
    if (!config.useBackend) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getDashboards({
        search: searchQuery,
        sortBy: 'updated_at',
        order: 'DESC'
      });

      if (response.success && response.data) {
        setDashboards(response.data.dashboards || []);
      }
    } catch (err) {
      console.error('Failed to load dashboards:', err);
      setError('Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  };

  const saveDashboard = async () => {
    if (!config.useBackend || !currentConfig) return;

    setLoading(true);
    setError(null);
    try {
      // Extract field structure from current data
      const expectedFields = currentData && currentData.length > 0
        ? Object.keys(currentData[0]).map(key => ({
            name: key,
            type: typeof currentData[0][key]
          }))
        : [];

      const dashboardData = {
        name: saveName,
        description: saveDescription,
        config: {
          // Save only the pivot configuration, not the data
          rows: currentConfig.rows || [],
          cols: currentConfig.cols || [],
          vals: currentConfig.vals || [],
          aggregatorName: currentConfig.aggregatorName || 'Count',
          rendererName: currentConfig.rendererName || 'Table',
          sorters: currentConfig.sorters || {},
          derivedAttributes: currentConfig.derivedAttributes || {},
          hiddenAttributes: currentConfig.hiddenAttributes || [],
          hiddenFromDragDrop: currentConfig.hiddenFromDragDrop || [],
          unusedOrientationCutoff: currentConfig.unusedOrientationCutoff || 85,
          menuLimit: currentConfig.menuLimit || 500,
        },
        expectedFields,
        dataSourceType: 'csv'
      };

      let response;
      if (selectedDashboard) {
        // Update existing dashboard
        response = await apiService.updateDashboard(selectedDashboard.id, dashboardData);
      } else {
        // Create new dashboard
        response = await apiService.createDashboard(dashboardData);
      }

      if (response.success) {
        setShowSaveDialog(false);
        setSaveName('');
        setSaveDescription('');
        setSelectedDashboard(null);
        loadDashboards(); // Reload list
        alert(`Dashboard "${saveName}" saved successfully!`);
      }
    } catch (err) {
      console.error('Failed to save dashboard:', err);
      setError('Failed to save dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async (dashboard: Dashboard) => {
    if (!dashboard.config) return;

    // Load the configuration into the pivot table
    onLoadDashboard(dashboard.config);
    
    // Update access tracking
    if (config.useBackend) {
      try {
        await apiService.getDashboard(dashboard.id);
      } catch (err) {
        console.error('Failed to update dashboard access:', err);
      }
    }

    alert(`Dashboard "${dashboard.name}" loaded. Please upload a CSV file with matching fields to see your saved configuration applied.`);
  };

  const deleteDashboard = async (dashboard: Dashboard) => {
    if (!config.useBackend) return;

    if (!confirm(`Are you sure you want to delete "${dashboard.name}"?`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await apiService.deleteDashboard(dashboard.id);
      if (response.success) {
        loadDashboards(); // Reload list
      }
    } catch (err) {
      console.error('Failed to delete dashboard:', err);
      setError('Failed to delete dashboard');
    } finally {
      setLoading(false);
    }
  };

  const duplicateDashboard = async (dashboard: Dashboard) => {
    if (!config.useBackend) return;

    const newName = prompt(`Enter name for the duplicate:`, `${dashboard.name} (Copy)`);
    if (!newName) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiService.duplicateDashboard(dashboard.id, { name: newName });
      if (response.success) {
        loadDashboards(); // Reload list
      }
    } catch (err) {
      console.error('Failed to duplicate dashboard:', err);
      setError('Failed to duplicate dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="dashboard-manager">
      <div className="dashboard-header">
        <h2>📊 Dashboard Manager</h2>
        <div className="dashboard-actions">
          <button 
            className="btn-new-dashboard"
            onClick={onCreateNew}
            title="Create new dashboard"
          >
            ➕ New Dashboard
          </button>
          
          {config.useBackend && currentConfig && (
            <button 
              className="btn-save-dashboard"
              onClick={() => {
                setSaveName(selectedDashboard?.name || '');
                setSaveDescription(selectedDashboard?.description || '');
                setShowSaveDialog(true);
              }}
              title="Save current configuration"
            >
              💾 Save Configuration
            </button>
          )}
        </div>
      </div>

      {config.useBackend ? (
        <>
          <div className="dashboard-search">
            <input
              type="text"
              placeholder="🔍 Search dashboards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && loadDashboards()}
            />
            <button onClick={loadDashboards}>Search</button>
          </div>

          {error && (
            <div className="dashboard-error">
              ⚠️ {error}
            </div>
          )}

          <div className="dashboard-list">
            {loading ? (
              <div className="dashboard-loading">Loading dashboards...</div>
            ) : dashboards.length === 0 ? (
              <div className="dashboard-empty">
                <p>No saved dashboards yet.</p>
                <p>Create your first dashboard by configuring the pivot table and clicking "Save Configuration".</p>
              </div>
            ) : (
              <div className="dashboard-grid">
                {dashboards.map((dashboard) => (
                  <div key={dashboard.id} className="dashboard-card">
                    <div className="dashboard-card-header">
                      <h3>{dashboard.name}</h3>
                      <div className="dashboard-card-actions">
                        <button
                          className="btn-icon"
                          onClick={() => loadDashboard(dashboard)}
                          title="Load dashboard"
                        >
                          📂
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => {
                            setSelectedDashboard(dashboard);
                            setSaveName(dashboard.name);
                            setSaveDescription(dashboard.description || '');
                            setShowSaveDialog(true);
                          }}
                          title="Edit dashboard"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => duplicateDashboard(dashboard)}
                          title="Duplicate dashboard"
                        >
                          📋
                        </button>
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => deleteDashboard(dashboard)}
                          title="Delete dashboard"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    {dashboard.description && (
                      <p className="dashboard-description">{dashboard.description}</p>
                    )}
                    <div className="dashboard-meta">
                      <span>Updated: {formatDate(dashboard.updated_at)}</span>
                      {dashboard.access_count !== undefined && (
                        <span>Views: {dashboard.access_count}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save Dialog */}
          {showSaveDialog && (
            <div className="dashboard-dialog-overlay" onClick={() => setShowSaveDialog(false)}>
              <div className="dashboard-dialog" onClick={(e) => e.stopPropagation()}>
                <h3>{selectedDashboard ? 'Update Dashboard' : 'Save Dashboard Configuration'}</h3>
                <div className="dashboard-form">
                  <div className="form-group">
                    <label>Dashboard Name *</label>
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Enter dashboard name..."
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={saveDescription}
                      onChange={(e) => setSaveDescription(e.target.value)}
                      placeholder="Enter description (optional)..."
                      rows={3}
                    />
                  </div>
                  <div className="dialog-info">
                    ℹ️ This will save your pivot table configuration (rows, columns, aggregations, filters).
                    Data is not saved - you can apply this configuration to any CSV with matching fields.
                  </div>
                  <div className="dialog-actions">
                    <button 
                      className="btn-secondary"
                      onClick={() => setShowSaveDialog(false)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn-primary"
                      onClick={saveDashboard}
                      disabled={!saveName.trim() || loading}
                    >
                      {loading ? 'Saving...' : (selectedDashboard ? 'Update' : 'Save')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="dashboard-offline">
          <p>🔌 Backend connection required for dashboard management.</p>
          <p>Configure your backend connection to save and load dashboard configurations.</p>
        </div>
      )}
    </div>
  );
};