@echo off
echo ========================================
echo Starting Pivot Grid Pro with Docker
echo ========================================
echo.

REM Check if Docker is running
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running!
    echo Please start Docker Desktop first.
    pause
    exit /b 1
)

echo Starting backend services with Docker Compose...
cd backend
docker-compose -f docker/docker-compose.dev.yml up -d

if %errorlevel% neq 0 (
    echo ERROR: Failed to start Docker services!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Services are starting up...
echo ========================================
echo.
echo Backend API:        http://localhost:3001
echo Health Check:       http://localhost:3001/health
echo pgAdmin:           http://localhost:8080  (admin@pivotgrid.com / admin123)
echo Redis Commander:    http://localhost:8081  (admin / admin123)
echo Bull Board:        http://localhost:3005
echo.
echo Frontend will be available at: http://localhost:5173
echo.
echo To view logs: docker-compose -f docker/docker-compose.dev.yml logs -f
echo To stop: docker-compose -f docker/docker-compose.dev.yml down
echo.

cd ..
echo Starting frontend development server...
npm run dev

pause