# Docker Desktop Startup Issues - Permanent Fix Guide

## Common Issues
1. Docker service not starting (com.docker.service STOPPED)
2. WSL2 hanging or not responding
3. Docker API returning 500 errors
4. Containers not starting after system restart

## Permanent Solutions

### 1. Fix WSL2 Issues
Run these commands in Administrator PowerShell:
```powershell
# Reset WSL
wsl --shutdown
wsl --unregister docker-desktop
wsl --unregister docker-desktop-data

# Update WSL
wsl --update

# Set WSL2 as default
wsl --set-default-version 2
```

### 2. Fix Docker Service
Run in Administrator Command Prompt:
```cmd
# Start Docker service
net start com.docker.service

# Set to automatic startup
sc config com.docker.service start=auto
```

### 3. Disable Fast Startup (Main Culprit)
1. Open Control Panel → Power Options
2. Click "Choose what the power button does"
3. Click "Change settings that are currently unavailable"
4. Uncheck "Turn on fast startup"
5. Save changes and restart

### 4. Reset Docker Desktop
1. Open Docker Desktop
2. Go to Settings → Troubleshoot
3. Click "Reset to factory defaults"
4. Restart Docker Desktop

### 5. Check Virtualization
In Administrator PowerShell:
```powershell
# Enable required features
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All
```

### 6. Add Docker to Windows Defender Exclusions
1. Open Windows Security
2. Go to Virus & threat protection → Manage settings
3. Add exclusions for:
   - C:\Program Files\Docker
   - C:\ProgramData\Docker
   - %USERPROFILE%\.docker

## Quick Restart Script
Save as `restart-docker.bat` and run as Administrator:
```batch
@echo off
echo Stopping Docker...
net stop com.docker.service
wsl --shutdown
timeout /t 5
echo Starting Docker...
net start com.docker.service
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Docker Desktop starting...
timeout /t 30
docker ps
echo Docker is ready!
```

## Alternative: Use Docker in WSL2 Directly
If Docker Desktop continues to have issues:
1. Install Docker directly in WSL2 Ubuntu
2. Access Docker from Windows via WSL2

```bash
# In WSL2 Ubuntu:
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

## Prevention Tips
1. Always properly shut down Docker before Windows shutdown
2. Don't use hibernate/sleep with Docker running
3. Keep WSL2 updated: `wsl --update`
4. Regularly clean Docker: `docker system prune -a`
5. Monitor disk space - Docker needs adequate free space

## If All Else Fails
1. Uninstall Docker Desktop completely
2. Clean up with: `C:\Program Files\Docker\Docker\resources\com.docker.diagnose.exe clean`
3. Restart Windows
4. Reinstall Docker Desktop fresh
5. Don't restore settings from backup