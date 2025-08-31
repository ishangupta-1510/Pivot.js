@echo off
echo ============================================
echo     Docker Restart Script
echo ============================================
echo.

echo [1/6] Stopping Docker processes...
taskkill /F /IM "Docker Desktop.exe" 2>nul
taskkill /F /IM "com.docker.backend.exe" 2>nul
taskkill /F /IM "docker.exe" 2>nul
taskkill /F /IM "dockerd.exe" 2>nul
echo Done.
echo.

echo [2/6] Stopping WSL...
wsl --shutdown 2>nul
taskkill /F /IM wsl.exe 2>nul
taskkill /F /IM wslhost.exe 2>nul
echo Done.
echo.

echo [3/6] Waiting for cleanup...
timeout /t 5 /nobreak >nul
echo Done.
echo.

echo [4/6] Starting Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Done.
echo.

echo [5/6] Waiting for Docker to initialize (this may take 60-90 seconds)...
timeout /t 90 /nobreak
echo Done.
echo.

echo [6/6] Starting containers...
cd /d C:\Users\Ishan\Desktop\pivot-grid-pro\backend\docker
docker-compose -f docker-compose.simple.yml up -d
echo.

echo ============================================
echo     Docker restart complete!
echo ============================================
echo.
echo Checking Docker status...
docker ps
echo.
pause