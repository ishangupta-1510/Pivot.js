# Docker Fix Script - Run as Administrator
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "   Docker Fix Script (Admin Mode)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if running as admin
function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Check for admin rights
if (-not (Test-Admin)) {
    Write-Host "This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "[1/8] Stopping Docker service..." -ForegroundColor Yellow
Stop-Service com.docker.service -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green

Write-Host "[2/8] Killing Docker processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.Name -like "*docker*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green

Write-Host "[3/8] Shutting down WSL..." -ForegroundColor Yellow
wsl --shutdown
Get-Process | Where-Object {$_.Name -like "*wsl*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green

Write-Host "[4/8] Starting Docker service..." -ForegroundColor Yellow
Start-Service com.docker.service -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green

Write-Host "[5/8] Setting Docker service to auto-start..." -ForegroundColor Yellow
Set-Service com.docker.service -StartupType Automatic
Write-Host "Done." -ForegroundColor Green

Write-Host "[6/8] Starting Docker Desktop..." -ForegroundColor Yellow
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
Write-Host "Done." -ForegroundColor Green

Write-Host "[7/8] Waiting for Docker to initialize (90 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 90
Write-Host "Done." -ForegroundColor Green

Write-Host "[8/8] Checking Docker status..." -ForegroundColor Yellow
docker version
docker ps

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "   Docker Fix Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Check if Docker Desktop shows 'Engine running'" -ForegroundColor White
Write-Host "2. Run: cd backend\docker" -ForegroundColor White
Write-Host "3. Run: docker-compose -f docker-compose.simple.yml up -d" -ForegroundColor White
Write-Host ""
pause