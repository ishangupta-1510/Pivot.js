# Pivot Grid Pro Backend

Enterprise-grade backend for processing large CSV files with real-time updates and job queue management.

## Features

- 🚀 **High-Performance CSV Processing**: Stream-based parsing for files up to 5GB
- 📊 **Job Queue System**: BullMQ-powered asynchronous processing
- 🔄 **Real-time Updates**: WebSocket support for live progress tracking
- 💾 **Optimized Storage**: PostgreSQL with JSONB and partitioning
- 🔒 **Production Ready**: Security, logging, monitoring, and error handling
- 🐳 **Docker Support**: Complete containerization for all services

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Express   │────▶│ PostgreSQL  │
│   (React)   │     │   API       │     │  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                     
       │            ┌─────────────┐            
       └───────────▶│   BullMQ    │            
     WebSocket      │  Job Queue  │            
                    └─────────────┘            
                           │                    
                    ┌─────────────┐            
                    │    Redis    │            
                    └─────────────┘            
```

## Quick Start

### Prerequisites

- Docker Desktop installed and running
- Node.js 18+ (for local development only)

### Using Docker (Required)

1. **Start all services with Docker Compose:**
   ```bash
   # Start all services including backend, database, Redis, and monitoring tools
   docker-compose -f docker/docker-compose.dev.yml up -d
   
   # Or build and start if making changes
   docker-compose -f docker/docker-compose.dev.yml up --build -d
   ```

2. **Check service status:**
   ```bash
   docker-compose -f docker/docker-compose.dev.yml ps
   ```

3. **View logs:**
   ```bash
   # All services
   docker-compose -f docker/docker-compose.dev.yml logs -f
   
   # Specific service
   docker-compose -f docker/docker-compose.dev.yml logs -f backend
   ```

4. **Stop services:**
   ```bash
   docker-compose -f docker/docker-compose.dev.yml down
   
   # Stop and remove volumes (clean slate)
   docker-compose -f docker/docker-compose.dev.yml down -v
   ```

## API Endpoints

### Health Check
- `GET /health` - System health status

### CSV Upload & Processing
- `POST /api/v1/upload/csv` - Upload CSV file for processing
- `GET /api/v1/upload/jobs` - List all processing jobs
- `GET /api/v1/upload/jobs/:jobId` - Get job status
- `POST /api/v1/upload/jobs/:jobId/retry` - Retry failed job
- `DELETE /api/v1/upload/jobs/:jobId` - Cancel job

### Queue Management
- `GET /api/v1/queues/stats` - Queue statistics
- `POST /api/v1/queues/:name/pause` - Pause queue
- `POST /api/v1/queues/:name/resume` - Resume queue

### WebSocket Events

Connect to `ws://localhost:3001` for real-time updates:

- `job:waiting` - Job queued
- `job:active` - Job started processing
- `job:progress` - Processing progress update
- `job:completed` - Job completed successfully
- `job:failed` - Job failed

## Development

### Run Tests
```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

### Database Migrations
```bash
npm run migrate         # Run migrations
npm run migrate:undo    # Rollback last migration
```

### Monitoring Tools

All monitoring tools are automatically started with Docker:

- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **pgAdmin**: http://localhost:8080 (admin@pivotgrid.com / admin123)
- **Redis Commander**: http://localhost:8081 (admin / admin123)
- **Bull Board Dashboard**: http://localhost:3005

## Configuration

### Environment Variables

Key configuration in `.env`:

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pivot_grid_dev
DB_USER=pivot_user
DB_PASSWORD=pivot_secure_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# File Upload
MAX_FILE_SIZE=5368709120  # 5GB
UPLOAD_DIR=./uploads

# Job Processing
MAX_CONCURRENT_JOBS=5
JOB_RETENTION_DAYS=7

# Security
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=your_secret_here
```

## Performance Optimization

### Database
- **Partitioning**: Dataset rows are partitioned by hash for better performance
- **Indexes**: Optimized indexes on frequently queried columns
- **Connection Pooling**: Configurable pool size (default: 20 connections)

### CSV Processing
- **Streaming**: Memory-efficient streaming parser
- **Batch Processing**: Configurable batch size (default: 1000 rows)
- **Type Inference**: Automatic data type detection

### Job Queue
- **Concurrency**: Process multiple jobs simultaneously
- **Retry Logic**: Exponential backoff for failed jobs
- **Priority Queues**: Different priorities for different job types

## Production Deployment

### Docker Commands

#### Development
```bash
# Start development environment
docker-compose -f docker/docker-compose.dev.yml up -d

# Rebuild after code changes
docker-compose -f docker/docker-compose.dev.yml up --build backend

# View real-time logs
docker-compose -f docker/docker-compose.dev.yml logs -f backend

# Execute commands in container
docker-compose -f docker/docker-compose.dev.yml exec backend npm test

# Clean everything
docker-compose -f docker/docker-compose.dev.yml down -v
```

#### Production
```bash
# Build production image
docker build -t pivot-grid-backend -f Dockerfile .

# Run production container
docker run -d \
  --name pivot-backend \
  -p 3001:3001 \
  --env-file .env.production \
  pivot-grid-backend
```

### Environment Setup
1. Use strong passwords and secrets
2. Enable SSL/TLS for database connections
3. Configure firewall rules
4. Set up monitoring and alerting
5. Implement backup strategies

### Scaling Considerations
- Horizontal scaling with multiple worker instances
- Redis Cluster for high availability
- PostgreSQL read replicas for query distribution
- CDN for static file delivery
- Load balancer for API endpoints

## Troubleshooting

### Common Issues

1. **Database connection failed:**
   - Check PostgreSQL is running
   - Verify credentials in `.env`
   - Ensure database exists

2. **Redis connection failed:**
   - Check Redis is running
   - Verify port 6379 is not blocked
   - Check Redis configuration

3. **File upload fails:**
   - Check `MAX_FILE_SIZE` in `.env`
   - Ensure `uploads` directory exists
   - Verify disk space available

4. **WebSocket not connecting:**
   - Check CORS settings
   - Verify WebSocket port is open
   - Check firewall rules

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.