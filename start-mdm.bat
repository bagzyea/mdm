@echo off
setlocal enabledelayedexpansion

echo ========================================
echo        🚀 MDM Application Startup
echo ========================================
echo.

REM Check if Docker is installed and running
echo [1/8] Checking Docker installation...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    echo 📖 Visit: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo [2/8] Checking if Docker is running...
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo ⏳ Waiting for Docker to start... (this may take a minute)
    
    :wait_docker
    timeout /t 10 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 (
        echo ⏳ Still waiting for Docker...
        goto wait_docker
    )
)

echo ✅ Docker is ready
echo.

REM Stop any existing containers
echo [3/8] Stopping existing containers...
docker-compose -f docker-compose.dev.yml down --remove-orphans >nul 2>&1
echo ✅ Cleaned up existing containers

REM Build and start services
echo [4/8] Building Docker images...
docker-compose -f docker-compose.dev.yml build --no-cache
if errorlevel 1 (
    echo ❌ Failed to build Docker images
    pause
    exit /b 1
)
echo ✅ Docker images built successfully

echo [5/8] Starting services...
docker-compose -f docker-compose.dev.yml up -d
if errorlevel 1 (
    echo ❌ Failed to start services
    pause
    exit /b 1
)
echo ✅ Services started

REM Wait for services to be ready
echo [6/8] Waiting for services to be ready...

REM Wait for database
echo ⏳ Waiting for PostgreSQL...
:wait_db
timeout /t 2 /nobreak >nul
docker-compose -f docker-compose.dev.yml exec -T db pg_isready -U mdm_user -d mdm_dev >nul 2>&1
if errorlevel 1 goto wait_db
echo ✅ PostgreSQL is ready

REM Wait for Redis
echo ⏳ Waiting for Redis...
:wait_redis
timeout /t 2 /nobreak >nul
docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping >nul 2>&1
if errorlevel 1 goto wait_redis
echo ✅ Redis is ready

REM Wait for backend
echo ⏳ Waiting for backend service...
:wait_backend
timeout /t 5 /nobreak >nul
curl -f http://localhost:5001/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo ✅ Backend service is ready

REM Setup database
echo [7/8] Setting up database...

REM Run Prisma migrations
echo ⏳ Running database migrations...
docker-compose -f docker-compose.dev.yml exec -T mdm-backend npx prisma migrate dev --name init
echo ✅ Database migrations completed

REM Generate Prisma client
echo ⏳ Generating Prisma client...
docker-compose -f docker-compose.dev.yml exec -T mdm-backend npx prisma generate
echo ✅ Prisma client generated

REM Create admin user
echo ⏳ Creating admin user...
docker-compose -f docker-compose.dev.yml exec -T mdm-backend npm run create-admin
echo ✅ Admin user created

REM Wait for frontend
echo ⏳ Waiting for frontend service...
:wait_frontend
timeout /t 5 /nobreak >nul
curl -f http://localhost:5000 >nul 2>&1
if errorlevel 1 goto wait_frontend
echo ✅ Frontend service is ready

echo [8/8] Verifying all services...
docker-compose -f docker-compose.dev.yml ps

echo.
echo ========================================
echo       🎉 MDM Application Ready!
echo ========================================
echo.
echo 📊 Service URLs:
echo   • Admin Dashboard:  http://localhost:5000
echo   • Backend API:      http://localhost:5001
echo   • API Health:       http://localhost:5001/health
echo   • PostgreSQL:       localhost:5432
echo   • Redis:            localhost:6379
echo.
echo 🔐 Default Admin Credentials:
echo   • Email:    admin@mdm.local
echo   • Password: admin123
echo.
echo 📱 Android App Configuration:
echo   • Server URL: http://10.0.2.2:5001 (for emulator)
echo   • Server URL: http://localhost:5001 (for physical device on same network)
echo.
echo 🛠️ Useful Commands:
echo   • View logs:     docker-compose -f docker-compose.dev.yml logs -f
echo   • Stop services: docker-compose -f docker-compose.dev.yml down
echo   • Restart:       docker-compose -f docker-compose.dev.yml restart
echo.

choice /c YN /m "Do you want to view the logs now? (Y/N)"
if errorlevel 2 goto end
if errorlevel 1 goto logs

:logs
echo.
echo 📋 Starting log viewer... (Press Ctrl+C to exit)
docker-compose -f docker-compose.dev.yml logs -f

:end
echo.
echo 🚀 MDM Application is running successfully!
pause