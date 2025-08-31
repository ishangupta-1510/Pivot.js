/**
 * Frontend Environment Configuration
 */

// Environment loaded successfully

export const config = {
  // Backend Integration
  useBackend: import.meta.env.VITE_USE_BACKEND === 'true',
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001',
  apiVersion: import.meta.env.VITE_API_VERSION || 'v1',
  
  // API Endpoints
  api: {
    baseUrl: `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/${import.meta.env.VITE_API_VERSION || 'v1'}`,
    endpoints: {
      uploadCSV: '/upload/csv',
      getJob: (jobId: string) => `/upload/jobs/${jobId}`,
      getJobs: '/upload/jobs',
      retryJob: (jobId: string) => `/upload/jobs/${jobId}/retry`,
      cancelJob: (jobId: string) => `/upload/jobs/${jobId}`,
      queueStats: '/queues/stats',
      health: '/health',
    },
  },
  
  // WebSocket Configuration
  websocket: {
    enabled: import.meta.env.VITE_USE_BACKEND === 'true',
    url: import.meta.env.VITE_BACKEND_URL?.replace('http', 'ws') || 'ws://localhost:3001',
  },
  
  // Upload Configuration
  upload: {
    maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
    allowedTypes: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    chunkSize: 1024 * 1024, // 1MB chunks for progress
  },
  
  // Feature Flags
  features: {
    serverSideProcessing: import.meta.env.VITE_USE_BACKEND === 'true',
    realtimeUpdates: import.meta.env.VITE_USE_BACKEND === 'true',
    jobQueue: import.meta.env.VITE_USE_BACKEND === 'true',
  },
};

export default config;