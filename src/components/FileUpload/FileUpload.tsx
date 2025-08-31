/**
 * File Upload Component with Backend Integration
 */

import React, { useState, useRef, useCallback } from 'react';
import config from '@/config/environment';
import { apiService, JobStatus } from '@/services/api.service';
import { websocketService } from '@/services/websocket.service';
import './FileUpload.css';

interface FileUploadProps {
  onDataLoad: (data: any[]) => void;
  onBackendJobStart?: (jobId: string) => void;
  onBackendJobComplete?: (datasetId: string) => void;
}

interface UploadState {
  isUploading: boolean;
  uploadProgress: number;
  jobId?: string;
  jobStatus?: JobStatus;
  error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onDataLoad,
  onBackendJobStart,
  onBackendJobComplete,
}) => {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    uploadProgress: 0,
  });
  const [processingMode, setProcessingMode] = useState<'frontend' | 'backend'>(() => {
    console.log('🔧 FileUpload component config check:');
    console.log('  config:', config);
    console.log('  config.useBackend:', config.useBackend);
    console.log('  import.meta.env.VITE_USE_BACKEND:', import.meta.env.VITE_USE_BACKEND);
    const mode = config.useBackend ? 'backend' : 'frontend';
    console.log('  selected processing mode:', mode);
    return mode;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Setup WebSocket listeners for real-time updates
  React.useEffect(() => {
    if (config.websocket.enabled && uploadState.jobId) {
      websocketService.connect();
      
      // Subscribe to job events
      websocketService.subscribe([
        `job:progress`,
        `job:completed`,
        `job:failed`,
      ]);

      // Handle job progress
      const handleProgress = (data: any) => {
        if (data.jobId === uploadState.jobId) {
          setUploadState(prev => ({
            ...prev,
            uploadProgress: data.progress?.percentage || 0,
            jobStatus: {
              ...prev.jobStatus!,
              progress: data.progress?.percentage || 0,
              rowsProcessed: data.progress?.processedRows,
              processingSpeed: data.progress?.processingSpeed,
            },
          }));
        }
      };

      // Handle job completion
      const handleCompleted = (data: any) => {
        if (data.jobId === uploadState.jobId) {
          setUploadState(prev => ({
            ...prev,
            isUploading: false,
            uploadProgress: 100,
            jobStatus: {
              ...prev.jobStatus!,
              status: 'completed',
            },
          }));

          if (onBackendJobComplete && data.result?.datasetId) {
            onBackendJobComplete(data.result.datasetId);
          }
        }
      };

      // Handle job failure
      const handleFailed = (data: any) => {
        if (data.jobId === uploadState.jobId) {
          setUploadState(prev => ({
            ...prev,
            isUploading: false,
            error: data.error || 'Processing failed',
            jobStatus: {
              ...prev.jobStatus!,
              status: 'failed',
              error: data.error,
            },
          }));
        }
      };

      websocketService.on('job:progress', handleProgress);
      websocketService.on('job:completed', handleCompleted);
      websocketService.on('job:failed', handleFailed);

      return () => {
        websocketService.off('job:progress', handleProgress);
        websocketService.off('job:completed', handleCompleted);
        websocketService.off('job:failed', handleFailed);
      };
    }
  }, [uploadState.jobId, onBackendJobComplete]);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setUploadState(prev => ({
        ...prev,
        error: 'Please select a CSV file',
      }));
      return;
    }

    // Validate file size
    if (file.size > config.upload.maxFileSize) {
      setUploadState(prev => ({
        ...prev,
        error: `File size exceeds maximum allowed size of ${config.upload.maxFileSize / (1024 * 1024 * 1024)}GB`,
      }));
      return;
    }

    // Clear previous errors
    setUploadState({
      isUploading: true,
      uploadProgress: 0,
    });

    console.log('🚀 File upload starting:');
    console.log('  processingMode:', processingMode);
    console.log('  config.useBackend:', config.useBackend);
    console.log('  Will use backend:', processingMode === 'backend' && config.useBackend);

    if (processingMode === 'backend' && config.useBackend) {
      // Backend processing
      console.log('📡 Using backend processing');
      await handleBackendUpload(file);
    } else {
      // Frontend processing
      console.log('🖥️ Using frontend processing');
      await handleFrontendProcessing(file);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [processingMode]);

  /**
   * Handle backend upload and processing
   */
  const handleBackendUpload = async (file: File) => {
    try {
      console.log('📡 Starting backend upload for file:', file.name);
      // Upload file to backend
      const uploadResponse = await apiService.uploadCSV(file, {
        hasHeaders: true,
        delimiter: ',',
        encoding: 'utf8',
        skipEmptyLines: true,
      });

      if (!uploadResponse.success || !uploadResponse.data) {
        throw new Error(uploadResponse.error || 'Upload failed');
      }

      const { jobId, estimatedProcessingTime } = uploadResponse.data;

      setUploadState(prev => ({
        ...prev,
        jobId,
        uploadProgress: 10,
      }));

      if (onBackendJobStart) {
        onBackendJobStart(jobId);
      }

      // Poll for job status if WebSocket is not available
      if (!config.websocket.enabled) {
        const finalStatus = await apiService.pollJobStatus(
          jobId,
          (status) => {
            setUploadState(prev => ({
              ...prev,
              uploadProgress: status.progress,
              jobStatus: status,
            }));
          },
          1000
        );

        if (finalStatus?.status === 'completed' && finalStatus.dataset) {
          setUploadState(prev => ({
            ...prev,
            isUploading: false,
            uploadProgress: 100,
          }));

          if (onBackendJobComplete) {
            onBackendJobComplete(finalStatus.dataset.id);
          }
        } else {
          throw new Error(finalStatus?.error || 'Processing failed');
        }
      }
    } catch (error) {
      console.error('Backend upload failed:', error);
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      }));
    }
  };

  /**
   * Handle frontend CSV processing
   */
  const handleFrontendProcessing = async (file: File) => {
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100;
        setUploadState(prev => ({
          ...prev,
          uploadProgress: Math.round(progress * 0.5), // 50% for reading
        }));
      }
    };

    reader.onload = (event) => {
      const text = event.target?.result as string;
      
      try {
        // Parse CSV
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        const data = lines.slice(1).map((line, index) => {
          const values = line.split(',');
          const row: any = {};
          
          headers.forEach((header, i) => {
            const value = values[i]?.trim();
            // Try to parse as number
            const numValue = parseFloat(value);
            row[header] = isNaN(numValue) ? value : numValue;
          });
          
          // Update progress
          if (index % 100 === 0) {
            const progress = 50 + (index / (lines.length - 1)) * 50;
            setUploadState(prev => ({
              ...prev,
              uploadProgress: Math.round(progress),
            }));
          }
          
          return row;
        });

        setUploadState({
          isUploading: false,
          uploadProgress: 100,
        });

        onDataLoad(data);
      } catch (error) {
        console.error('CSV parsing failed:', error);
        setUploadState({
          isUploading: false,
          uploadProgress: 0,
          error: 'Failed to parse CSV file',
        });
      }
    };

    reader.onerror = () => {
      setUploadState({
        isUploading: false,
        uploadProgress: 0,
        error: 'Failed to read file',
      });
    };

    reader.readAsText(file);
  };

  /**
   * Retry failed job
   */
  const handleRetryJob = async () => {
    if (!uploadState.jobId) return;

    setUploadState(prev => ({
      ...prev,
      isUploading: true,
      error: undefined,
    }));

    const result = await apiService.retryJob(uploadState.jobId);
    
    if (result.success) {
      // Start polling again
      const finalStatus = await apiService.pollJobStatus(
        uploadState.jobId,
        (status) => {
          setUploadState(prev => ({
            ...prev,
            uploadProgress: status.progress,
            jobStatus: status,
          }));
        }
      );

      if (finalStatus?.status === 'completed') {
        setUploadState(prev => ({
          ...prev,
          isUploading: false,
          uploadProgress: 100,
        }));
      }
    } else {
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: result.error,
      }));
    }
  };

  /**
   * Cancel ongoing job
   */
  const handleCancelJob = async () => {
    if (!uploadState.jobId) return;

    await apiService.cancelJob(uploadState.jobId);
    
    setUploadState({
      isUploading: false,
      uploadProgress: 0,
      jobId: undefined,
      jobStatus: undefined,
    });
  };

  return (
    <div className="file-upload-container">
      <div className="upload-header">
        <h3>Upload CSV File</h3>
        
        {config.useBackend && (
          <div className="processing-mode-toggle">
            <label>
              <input
                type="radio"
                value="frontend"
                checked={processingMode === 'frontend'}
                onChange={() => setProcessingMode('frontend')}
                disabled={uploadState.isUploading}
              />
              Frontend Processing
            </label>
            <label>
              <input
                type="radio"
                value="backend"
                checked={processingMode === 'backend'}
                onChange={() => setProcessingMode('backend')}
                disabled={uploadState.isUploading}
              />
              Backend Processing
            </label>
          </div>
        )}
      </div>

      <div className="upload-area">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          disabled={uploadState.isUploading}
          style={{ display: 'none' }}
        />

        {!uploadState.isUploading && !uploadState.jobStatus && (
          <button
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Choose CSV File
          </button>
        )}

        {uploadState.isUploading && (
          <div className="upload-progress">
            <div className="progress-info">
              <span>
                {processingMode === 'backend' ? 'Processing on server...' : 'Processing locally...'}
              </span>
              <span>{uploadState.uploadProgress}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${uploadState.uploadProgress}%` }}
              />
            </div>
            {uploadState.jobStatus && (
              <div className="job-details">
                <p>Status: {uploadState.jobStatus.status}</p>
                {uploadState.jobStatus.rowsProcessed && (
                  <p>
                    Rows: {uploadState.jobStatus.rowsProcessed}
                    {uploadState.jobStatus.totalRowsEstimated && 
                      ` / ${uploadState.jobStatus.totalRowsEstimated}`}
                  </p>
                )}
                {uploadState.jobStatus.processingSpeed && (
                  <p>Speed: {uploadState.jobStatus.processingSpeed} rows/sec</p>
                )}
              </div>
            )}
            {processingMode === 'backend' && uploadState.jobId && (
              <button
                className="cancel-button"
                onClick={handleCancelJob}
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {uploadState.error && (
          <div className="upload-error">
            <p>{uploadState.error}</p>
            {uploadState.jobStatus?.status === 'failed' && (
              <button
                className="retry-button"
                onClick={handleRetryJob}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {uploadState.jobStatus?.status === 'completed' && (
          <div className="upload-success">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p>File processed successfully!</p>
            {uploadState.jobStatus.dataset && (
              <p>Dataset ID: {uploadState.jobStatus.dataset.id}</p>
            )}
          </div>
        )}
      </div>

      <div className="upload-info">
        <p>
          <strong>Processing Mode:</strong> {processingMode === 'backend' ? 'Server-side' : 'Client-side'}
        </p>
        <p>
          <strong>Max file size:</strong> {config.upload.maxFileSize / (1024 * 1024 * 1024)}GB
        </p>
        <p>
          <strong>Supported formats:</strong> CSV
        </p>
      </div>
    </div>
  );
};