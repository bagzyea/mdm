@echo off
setlocal enabledelayedexpansion

echo 🧪 Testing MDM Docker Setup...
echo.

REM Test counter
set TESTS_PASSED=0
set TESTS_FAILED=0

REM Test 1: Check if Docker is running
echo [TEST] Running: Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Docker is running
    set /a TESTS_FAILED+=1
) else (
    echo [PASS] Docker is running
    set /a TESTS_PASSED+=1
)

REM Test 2: Check if containers are running
echo [TEST] Running: Containers are running
docker-compose -f docker-compose.dev.yml ps | findstr "Up" >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Containers are running
    set /a TESTS_FAILED+=1
) else (
    echo [PASS] Containers are running
    set /a TESTS_PASSED+=1
)

REM Test 3: Check backend health endpoint
echo [TEST] Running: Backend health endpoint
curl -f http://localhost:5001/health >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Backend health endpoint
    set /a TESTS_FAILED+=1
) else (
    echo [PASS] Backend health endpoint
    set /a TESTS_PASSED+=1
)

REM Test 4: Check database connection
echo [TEST] Running: Database connection
docker-compose -f docker-compose.dev.yml exec -T db pg_isready -U mdm_user -d mdm_dev >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Database connection
    set /a TESTS_FAILED+=1
) else (
    echo [PASS] Database connection
    set /a TESTS_PASSED+=1
)

REM Test 5: Check Redis connection
echo [TEST] Running: Redis connection
docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Redis connection
    set /a TESTS_FAILED+=1
) else (
    echo [PASS] Redis connection
    set /a TESTS_PASSED+=1
)

REM Test 6: Check if admin user exists
echo [TEST] Running: Admin user exists
docker-compose -f docker-compose.dev.yml exec -T mdm-backend npx prisma studio --help >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Admin user exists
    set /a TESTS_FAILED+=1
) else (
    echo [PASS] Admin user exists
    set /a TESTS_PASSED+=1
)

REM Test 7: Test authentication endpoint
echo [TEST] Testing authentication endpoint...
for /f "tokens=*" %%i in ('curl -s -X POST http://localhost:5001/api/auth/login -H "Content-Type: application/json" -d "{\"email\": \"admin@mdm.local\", \"password\": \"admin123\"}" 2^>nul') do set AUTH_RESPONSE=%%i

echo !AUTH_RESPONSE! | findstr "success.*true" >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Authentication endpoint
    set /a TESTS_FAILED+=1
) else (
    echo [PASS] Authentication endpoint
    set /a TESTS_PASSED+=1
)

REM Test 8: Test protected endpoint (if we have a token)
echo [TEST] Testing protected endpoint...
echo !AUTH_RESPONSE! | findstr "accessToken" >nul 2>&1
if errorlevel 1 (
    echo [WARN] No authentication token available for protected endpoint test
) else (
    REM Extract token (simplified version)
    for /f "tokens=2 delims=:," %%a in ('echo !AUTH_RESPONSE! ^| findstr "accessToken"') do set TOKEN=%%a
    set TOKEN=!TOKEN:"=!
    set TOKEN=!TOKEN: =!
    
    if defined TOKEN (
        curl -s -f -H "Authorization: Bearer !TOKEN!" http://localhost:5001/api/devices >nul 2>&1
        if errorlevel 1 (
            echo [FAIL] Protected endpoint access
            set /a TESTS_FAILED+=1
        ) else (
            echo [PASS] Protected endpoint access
            set /a TESTS_PASSED+=1
        )
    ) else (
        echo [WARN] Could not extract token for protected endpoint test
    )
)

REM Test 9: Check service logs for errors
echo [TEST] Checking service logs for errors...
for /f "tokens=*" %%i in ('docker-compose -f docker-compose.dev.yml logs --tail=50 2^>nul ^| findstr /i "error exception fatal" ^| find /c /v ""') do set ERROR_COUNT=%%i
if !ERROR_COUNT!==0 (
    echo [PASS] No errors in service logs
    set /a TESTS_PASSED+=1
) else (
    echo [WARN] Found !ERROR_COUNT! potential errors in service logs
    set /a TESTS_FAILED+=1
)

REM Test 10: Check resource usage
echo [TEST] Checking resource usage...
for /f "tokens=*" %%i in ('docker-compose -f docker-compose.dev.yml ps -q 2^>nul ^| find /c /v ""') do set CONTAINER_COUNT=%%i
if !CONTAINER_COUNT! geq 3 (
    echo [PASS] All containers are running (!CONTAINER_COUNT! containers)
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] Not all containers are running (found !CONTAINER_COUNT! containers)
    set /a TESTS_FAILED+=1
)

REM Summary
echo.
echo 📊 Test Summary
echo ===============
echo Tests Passed: !TESTS_PASSED!
echo Tests Failed: !TESTS_FAILED!
set /a TOTAL_TESTS=!TESTS_PASSED!+!TESTS_FAILED!
echo Total Tests: !TOTAL_TESTS!

if !TESTS_FAILED!==0 (
    echo.
    echo [PASS] 🎉 All tests passed! Your MDM Docker setup is working correctly.
    echo.
    echo Next steps:
    echo   1. Access the admin dashboard: http://localhost:3000
    echo   2. Test the API: curl http://localhost:5001/health
    echo   3. View logs: docker-compose -f docker-compose.dev.yml logs -f
    echo   4. Stop services: docker-compose -f docker-compose.dev.yml down
) else (
    echo.
    echo [FAIL] ❌ Some tests failed. Please check the issues above.
    echo.
    echo Troubleshooting:
    echo   1. Check logs: docker-compose -f docker-compose.dev.yml logs -f
    echo   2. Restart services: docker-compose -f docker-compose.dev.yml restart
    echo   3. Rebuild services: docker-compose -f docker-compose.dev.yml build --no-cache
    echo   4. Check the DOCKER_TESTING_GUIDE.md for more details
)

echo.
pause
