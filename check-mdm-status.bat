@echo off
echo ========================================
echo      📊 MDM Application Status
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running
    echo.
    pause
    exit /b 1
)

REM Check container status
echo 🐳 Container Status:
docker-compose -f docker-compose.dev.yml ps
echo.

REM Check service health
echo 🏥 Service Health Checks:
echo.

echo ⏳ Testing PostgreSQL...
docker-compose -f docker-compose.dev.yml exec -T db pg_isready -U mdm_user -d mdm_dev >nul 2>&1
if errorlevel 1 (
    echo ❌ PostgreSQL is not ready
) else (
    echo ✅ PostgreSQL is healthy
)

echo ⏳ Testing Redis...
docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo ❌ Redis is not ready
) else (
    echo ✅ Redis is healthy
)

echo ⏳ Testing Backend API...
curl -f http://localhost:5001/health >nul 2>&1
if errorlevel 1 (
    echo ❌ Backend API is not responding
) else (
    echo ✅ Backend API is healthy
)

echo ⏳ Testing Frontend...
curl -f http://localhost:5000 >nul 2>&1
if errorlevel 1 (
    echo ❌ Frontend is not responding
) else (
    echo ✅ Frontend is healthy
)

echo.
echo 📊 Resource Usage:
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo.
echo 🌐 Available Services:
echo   • Admin Dashboard:  http://localhost:5000
echo   • Backend API:      http://localhost:5001/health
echo   • Database:         localhost:5432
echo   • Redis:            localhost:6379
echo.

pause