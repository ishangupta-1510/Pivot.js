/**
 * Express Application Setup
 * Main application configuration with middleware, routes, and error handling
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from '@/config/environment';
import { database } from '@/config/database';
import { redis } from '@/config/redis';
import { queueManager } from '@/jobs/queue-manager';
import { eventManager } from '@/services/event-manager';
import CSVProcessingWorker from '@/jobs/csv-processing.worker';
import { UploadController, uploadMiddleware } from '@/controllers/upload.controller';
import { DashboardController } from '@/controllers/dashboard.controller';
import { logger, logHttpRequest, logError } from '@/utils/logger';

class Application {
  private app: express.Application;
  private server: any;
  private csvWorker: CSVProcessingWorker | null = null;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: config.security.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.security.rateLimit.windowMs,
      max: config.security.rateLimit.max,
      message: {
        error: 'Too many requests from this IP',
        code: 'RATE_LIMIT_EXCEEDED',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        logHttpRequest(
          req.method,
          req.originalUrl,
          res.statusCode,
          duration,
          req.get('User-Agent'),
          (req as any).user?.id
        );
      });
      
      next();
    });

    // Mock authentication middleware (replace with real authentication)
    this.app.use((req, res, next) => {
      const apiKey = req.headers['x-api-key'] as string;
      const authHeader = req.headers.authorization as string;
      
      if (apiKey === 'dev-api-key' || authHeader?.startsWith('Bearer ')) {
        (req as any).user = { 
          id: 'dev-user', 
          email: 'dev@example.com',
          role: 'admin' 
        };
      }
      
      next();
    });

    logger.info('✅ Middleware configured successfully');
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const [dbHealth, redisHealth, queueHealth, eventHealth] = await Promise.all([
          database.healthCheck(),
          redis.healthCheck(),
          queueManager.healthCheck(),
          eventManager.healthCheck(),
        ]);

        const overall = dbHealth.healthy && redisHealth.healthy && 
                       queueHealth.healthy && eventHealth.healthy;

        res.status(overall ? 200 : 503).json({
          status: overall ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: {
            database: {
              status: dbHealth.healthy ? 'healthy' : 'unhealthy',
              latency: dbHealth.latency,
            },
            redis: {
              status: redisHealth.healthy ? 'healthy' : 'unhealthy',
              latency: redisHealth.latency,
              memory: redisHealth.memory,
            },
            queue: {
              status: queueHealth.healthy ? 'healthy' : 'unhealthy',
              queues: Object.keys(queueHealth.queues).length,
            },
            events: {
              status: eventHealth.healthy ? 'healthy' : 'unhealthy',
              connectedClients: eventHealth.websocket.connectedClients,
            },
          },
          version: process.env.npm_package_version || '1.0.0',
          environment: config.env,
          uptime: process.uptime(),
        });
      } catch (error) {
        logError(error, 'health-check');
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // API routes
    const apiRouter = express.Router();

    // Upload endpoints
    apiRouter.post('/upload/csv', uploadMiddleware, UploadController.uploadCSV);
    apiRouter.get('/upload/jobs/:jobId', UploadController.getJobStatus);
    apiRouter.get('/upload/jobs', UploadController.getUploadJobs);
    apiRouter.post('/upload/jobs/:jobId/retry', UploadController.retryJob);
    apiRouter.delete('/upload/jobs/:jobId', UploadController.cancelJob);

    // Dashboard endpoints
    apiRouter.get('/dashboards', DashboardController.listDashboards.bind(DashboardController));
    apiRouter.get('/dashboards/:id', DashboardController.getDashboard.bind(DashboardController));
    apiRouter.post('/dashboards', DashboardController.createDashboard.bind(DashboardController));
    apiRouter.put('/dashboards/:id', DashboardController.updateDashboard.bind(DashboardController));
    apiRouter.delete('/dashboards/:id', DashboardController.deleteDashboard.bind(DashboardController));
    apiRouter.post('/dashboards/:id/duplicate', DashboardController.duplicateDashboard.bind(DashboardController));

    // Queue management endpoints
    apiRouter.get('/queues/stats', async (req, res) => {
      try {
        const stats = await queueManager.getAllQueuesStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        logError(error, 'queue-stats');
        res.status(500).json({
          success: false,
          error: 'Failed to get queue statistics',
        });
      }
    });

    apiRouter.get('/queues/:queueName/stats', async (req, res) => {
      try {
        const { queueName } = req.params;
        const stats = await queueManager.getQueueStats(queueName);
        res.json({ success: true, data: stats });
      } catch (error) {
        logError(error, 'queue-specific-stats');
        res.status(500).json({
          success: false,
          error: 'Failed to get queue statistics',
        });
      }
    });

    apiRouter.post('/queues/:queueName/pause', async (req, res) => {
      try {
        const { queueName } = req.params;
        await queueManager.pauseQueue(queueName);
        res.json({
          success: true,
          message: `Queue '${queueName}' paused successfully`,
        });
      } catch (error) {
        logError(error, 'pause-queue');
        res.status(500).json({
          success: false,
          error: 'Failed to pause queue',
        });
      }
    });

    apiRouter.post('/queues/:queueName/resume', async (req, res) => {
      try {
        const { queueName } = req.params;
        await queueManager.resumeQueue(queueName);
        res.json({
          success: true,
          message: `Queue '${queueName}' resumed successfully`,
        });
      } catch (error) {
        logError(error, 'resume-queue');
        res.status(500).json({
          success: false,
          error: 'Failed to resume queue',
        });
      }
    });

    // Event management endpoints
    apiRouter.get('/events/stats', (req, res) => {
      try {
        const stats = eventManager.getConnectedClientsStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        logError(error, 'event-stats');
        res.status(500).json({
          success: false,
          error: 'Failed to get event statistics',
        });
      }
    });

    // Development endpoints (only in development)
    if (config.env === 'development') {
      apiRouter.post('/dev/events/test', async (req, res) => {
        try {
          const { eventType, data } = req.body;
          await eventManager.publishEvent(eventType, data);
          res.json({
            success: true,
            message: 'Test event published',
          });
        } catch (error) {
          logError(error, 'test-event');
          res.status(500).json({
            success: false,
            error: 'Failed to publish test event',
          });
        }
      });

      apiRouter.post('/dev/redis/flush', async (req, res) => {
        try {
          await redis.flushDatabase();
          res.json({
            success: true,
            message: 'Redis database flushed',
          });
        } catch (error) {
          logError(error, 'flush-redis');
          res.status(500).json({
            success: false,
            error: 'Failed to flush Redis database',
          });
        }
      });
    }

    // Mount API routes
    this.app.use('/api/v1', apiRouter);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Pivot Grid Pro Backend',
        version: process.env.npm_package_version || '1.0.0',
        environment: config.env,
        status: 'running',
        endpoints: {
          health: '/health',
          api: '/api/v1',
          upload: '/api/v1/upload',
          queues: '/api/v1/queues',
          events: '/api/v1/events',
        },
        documentation: 'https://github.com/your-org/pivot-grid-pro',
      });
    });

    logger.info('✅ Routes configured successfully');
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
      });
    });

    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logError(error, 'express-error-handler', {
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        userId: (req as any).user?.id,
      });

      // Multer file upload errors
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'File too large',
          code: 'FILE_TOO_LARGE',
          maxSize: config.upload.maxFileSize,
        });
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          error: 'Unexpected file field',
          code: 'UNEXPECTED_FILE',
        });
      }

      // Rate limit errors
      if (error.type === 'entity.too.large') {
        return res.status(413).json({
          success: false,
          error: 'Request entity too large',
          code: 'ENTITY_TOO_LARGE',
        });
      }

      // Default error response
      const statusCode = error.statusCode || error.status || 500;
      const message = config.env === 'production' 
        ? 'Internal server error' 
        : error.message || 'An unexpected error occurred';

      res.status(statusCode).json({
        success: false,
        error: message,
        code: error.code || 'INTERNAL_ERROR',
        ...(config.env !== 'production' && { stack: error.stack }),
      });
    });

    logger.info('✅ Error handling configured successfully');
  }

  public async initialize(): Promise<void> {
    try {
      console.log('[App] Initialize: Starting...');
      logger.info('🚀 Initializing Pivot Grid Pro Backend...');

      // Initialize database
      console.log('[App] Initialize: Connecting to Database...');
      await database.initialize();
      console.log('[App] Initialize: Database connected');

      // Initialize Redis
      console.log('[App] Initialize: Connecting to Redis...');
      await redis.initialize();
      console.log('[App] Initialize: Redis connected');

      // Initialize queue manager
      console.log('[App] Initialize: Initializing Queue Manager...');
      await queueManager.initialize();
      console.log('[App] Initialize: Queue Manager initialized');

      // Initialize CSV processing worker
      console.log('[App] Initialize: Setting up CSV Worker...');
      this.csvWorker = new CSVProcessingWorker();
      queueManager.registerWorker('csv-processing', this.csvWorker.getWorker());
      console.log('[App] Initialize: CSV Worker registered');

      // Create HTTP server
      console.log('[App] Initialize: Creating HTTP server...');
      this.server = createServer(this.app);
      console.log('[App] Initialize: HTTP server created');

      // Initialize event manager with WebSocket
      console.log('[App] Initialize: Initializing Event Manager...');
      await eventManager.initialize(this.server);
      console.log('[App] Initialize: Event Manager initialized');

      logger.info('✅ All services initialized successfully');
      console.log('[App] Initialize: Complete!');

    } catch (error) {
      console.error('[App] Initialize: Failed:', error);
      logger.error('❌ Application initialization failed:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      console.log('[App] Starting server initialization...');
      await this.initialize();
      console.log('[App] Initialization complete, starting HTTP server...');

      this.server.listen(config.port, config.host, () => {
        console.log(`[App] Server listening on ${config.host}:${config.port}`);
        logger.info(`🎯 Server running on ${config.host}:${config.port}`, {
          environment: config.env,
          pid: process.pid,
          nodeVersion: process.version,
        });
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();
      console.log('[App] Server start complete');

    } catch (error) {
      console.error('[App] Failed to start server:', error);
      logger.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`📴 Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        this.server.close(async () => {
          logger.info('🔌 HTTP server closed');

          // Close all services
          await Promise.all([
            this.csvWorker?.close(),
            queueManager.close(),
            eventManager.close(),
            database.close(),
            redis.close(),
          ]);

          logger.info('✅ Graceful shutdown completed');
          process.exit(0);
        });

        // Force shutdown after 30 seconds
        setTimeout(() => {
          logger.error('⏰ Graceful shutdown timeout, forcing exit');
          process.exit(1);
        }, 30000);

      } catch (error) {
        logger.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      setTimeout(() => process.exit(1), 1000);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      setTimeout(() => process.exit(1), 1000);
    });

    logger.info('✅ Graceful shutdown handlers configured');
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getServer(): any {
    return this.server;
  }
}

// Export singleton instance
export const app = new Application();

// Start server if this file is run directly
if (require.main === module) {
  app.start().catch((error) => {
    logger.error('Failed to start application:', error);
    process.exit(1);
  });
}