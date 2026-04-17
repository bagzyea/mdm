@echo off
setlocal enabledelayedexpansion

echo 🚀 Starting MDM Docker Setup for Windows...

REM Check if Docker is installed
echo [INFO] Checking Docker installation...
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed. Please install Docker Desktop first.
    echo [INFO] Visit: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

REM Check if Docker is running
echo [INFO] Checking if Docker is running...
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)

echo [SUCCESS] Docker is installed and running

REM Create environment files if they don't exist
echo [INFO] Setting up environment files...

if not exist "backend\.env" (
    if exist "backend\env.example" (
        copy "backend\env.example" "backend\.env"
        echo [SUCCESS] Created backend\.env from template
    ) else (
        echo [WARNING] No env.example found. You'll need to create backend\.env manually
    )
) else (
    echo [INFO] backend\.env already exists
)

REM Stop any existing containers
echo [INFO] Stopping existing containers...
docker-compose -f docker-compose.dev.yml down --remove-orphans

REM Build and start services
echo [INFO] Building services...
docker-compose -f docker-compose.dev.yml build --no-cache

echo [INFO] Starting services...
docker-compose -f docker-compose.dev.yml up -d

echo [SUCCESS] Services started successfully

REM Wait for services to be ready
echo [INFO] Waiting for services to be ready...

REM Wait for database
echo [INFO] Waiting for PostgreSQL...
:wait_db
docker-compose -f docker-compose.dev.yml exec -T db pg_isready -U mdm_user -d mdm_dev >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_db
)
echo [SUCCESS] PostgreSQL is ready

REM Wait for Redis
echo [INFO] Waiting for Redis...
:wait_redis
docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_redis
)
echo [SUCCESS] Redis is ready

REM Wait for backend
echo [INFO] Waiting for backend service...
:wait_backend
curl -f http://localhost:5001/health >nul 2>&1
if errorlevel 1 (
    timeout /t 5 /nobreak >nul
    goto wait_backend
)
echo [SUCCESS] Backend service is ready

REM Setup database
echo [INFO] Setting up database...

REM Run Prisma migrations
echo [INFO] Running Prisma migrations...
docker-compose -f docker-compose.dev.yml exec -T mdm-backend npx prisma migrate dev --name init

REM Generate Prisma client
echo [INFO] Generating Prisma client...
docker-compose -f docker-compose.dev.yml exec -T mdm-backend npx prisma generate

REM Create admin user
echo [INFO] Creating admin user...
docker-compose -f docker-compose.dev.yml exec -T mdm-backend npm run create-admin

echo [SUCCESS] Database setup completed

REM Show service status
echo [INFO] Service Status:
docker-compose -f docker-compose.dev.yml ps

echo.
echo [INFO] Service URLs:
echo   Backend API: http://localhost:5001
echo   Health Check: http://localhost:5001/health
echo   Frontend Dashboard: http://localhost:5000
echo   PostgreSQL: localhost:5432
echo   Redis: localhost:6379
echo.

echo [INFO] Default Admin Credentials:
echo   Email: admin@mdm.local
echo   Password: admin123
echo.

echo [SUCCESS] 🎉 MDM Docker setup completed successfully!
echo.
echo [INFO] Next steps:
echo   1. Test the API: curl http://localhost:5001/health
echo   2. Access the admin dashboard: http://localhost:5000
echo   3. View logs: docker-compose -f docker-compose.dev.yml logs -f
echo   4. Stop services: docker-compose -f docker-compose.dev.yml down
echo.

pause
