/**
 * API Service
 * Handles all backend API communications
 */

import config from '@/config/environment';

export interface UploadResponse {
  success: boolean;
  data?: {
    jobId: string;
    queueJobId: string;
    filename: string;
    fileSize: number;
    status: string;
    options: any;
    estimatedProcessingTime: number;
  };
  error?: string;
  code?: string;
  message?: string;
}

export interface JobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  filename: string;
  fileSize: number;
  rowsProcessed?: number;
  totalRowsEstimated?: number;
  processingSpeed?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  dataset?: {
    id: string;
    name: string;
    status: string;
    totalRows?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface JobListResponse {
  success: boolean;
  data?: {
    jobs: JobStatus[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
  error?: string;
}

export interface QueueStats {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: { status: string; latency: number };
    redis: { status: string; latency: number; memory: string };
    queue: { status: string; queues: number };
    events: { status: string; connectedClients: number };
  };
  version: string;
  environment: string;
  uptime: number;
}

class ApiService {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
      'x-api-key': 'dev-api-key', // In production, this should come from auth
    };
  }

  /**
   * Upload CSV file for processing
   */
  async uploadCSV(
    file: File,
    options: {
      hasHeaders?: boolean;
      delimiter?: string;
      encoding?: string;
      skipEmptyLines?: boolean;
      maxRows?: number;
    } = {}
  ): Promise<UploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Add options to form data
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined) {
          formData.append(key, String(value));
        }
      });

      const response = await fetch(`${this.baseUrl}${config.api.endpoints.uploadCSV}`, {
        method: 'POST',
        headers: {
          'x-api-key': 'dev-api-key',
        },
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      return data;
    } catch (error) {
      console.error('CSV upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
        code: 'UPLOAD_ERROR',
      };
    }
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}${config.api.endpoints.getJob(jobId)}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get job status');
      }

      return data.data;
    } catch (error) {
      console.error('Failed to get job status:', error);
      return null;
    }
  }

  /**
   * Get list of upload jobs
   */
  async getJobs(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<JobListResponse> {
    try {
      const queryParams = new URLSearchParams();
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) {
            queryParams.append(key, String(value));
          }
        });
      }

      const url = `${this.baseUrl}${config.api.endpoints.getJobs}${
        queryParams.toString() ? `?${queryParams.toString()}` : ''
      }`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get jobs');
      }

      return data;
    } catch (error) {
      console.error('Failed to get jobs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get jobs',
      };
    }
  }

  /**
   * Dashboard Management APIs
   */
  
  async getDashboards(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    order?: string;
  }): Promise<any> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params?.order) queryParams.append('order', params.order);

      const response = await fetch(
        `${this.baseUrl}/dashboards?${queryParams.toString()}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Failed to get dashboards:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get dashboards',
      };
    }
  }

  async getDashboard(id: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/dashboards/${id}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Failed to get dashboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get dashboard',
      };
    }
  }

  async createDashboard(data: any): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/dashboards`,
        {
          method: 'POST',
          headers: {
            ...this.headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Failed to create dashboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create dashboard',
      };
    }
  }

  async updateDashboard(id: string, data: any): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/dashboards/${id}`,
        {
          method: 'PUT',
          headers: {
            ...this.headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Failed to update dashboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update dashboard',
      };
    }
  }

  async deleteDashboard(id: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/dashboards/${id}`,
        {
          method: 'DELETE',
          headers: this.headers,
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Failed to delete dashboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete dashboard',
      };
    }
  }

  async duplicateDashboard(id: string, data: { name: string }): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/dashboards/${id}/duplicate`,
        {
          method: 'POST',
          headers: {
            ...this.headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Failed to duplicate dashboard:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to duplicate dashboard',
      };
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}${config.api.endpoints.retryJob(jobId)}`,
        {
          method: 'POST',
          headers: this.headers,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to retry job');
      }

      return data;
    } catch (error) {
      console.error('Failed to retry job:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry job',
      };
    }
  }

  /**
   * Cancel a pending or processing job
   */
  async cancelJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}${config.api.endpoints.cancelJob(jobId)}`,
        {
          method: 'DELETE',
          headers: this.headers,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel job');
      }

      return data;
    } catch (error) {
      console.error('Failed to cancel job:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel job',
      };
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<QueueStats[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}${config.api.endpoints.queueStats}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get queue stats');
      }

      return data.data;
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return [];
    }
  }

  /**
   * Check backend health
   */
  async checkHealth(): Promise<HealthStatus | null> {
    try {
      const response = await fetch(
        `${this.baseUrl.replace('/api/v1', '')}${config.api.endpoints.health}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error('Health check failed');
      }

      return data;
    } catch (error) {
      console.error('Health check failed:', error);
      return null;
    }
  }

  /**
   * Poll job status until completion
   */
  async pollJobStatus(
    jobId: string,
    onProgress?: (status: JobStatus) => void,
    interval: number = 1000
  ): Promise<JobStatus | null> {
    return new Promise((resolve) => {
      const pollInterval = setInterval(async () => {
        const status = await this.getJobStatus(jobId);
        
        if (!status) {
          clearInterval(pollInterval);
          resolve(null);
          return;
        }

        if (onProgress) {
          onProgress(status);
        }

        if (['completed', 'failed', 'cancelled'].includes(status.status)) {
          clearInterval(pollInterval);
          resolve(status);
        }
      }, interval);

      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        resolve(null);
      }, 10 * 60 * 1000);
    });
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;