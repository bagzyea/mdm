@echo off
echo ========================================
echo     MDM App Functionality Tester
echo ========================================

set ADB_PATH=C:\Users\allan.agaba\AppData\Local\Android\Sdk\platform-tools\adb.exe

echo.
echo Testing MDM App Functionality...
echo.

echo 1. Checking if app is installed...
"%ADB_PATH%" shell pm list packages | findstr com.mdm.app
if %ERRORLEVEL% EQU 0 (
    echo ✓ MDM app is installed
) else (
    echo ✗ MDM app is not installed
    echo Please install the app first using install-apk.bat
    pause
    exit /b 1
)

echo.
echo 2. Launching MDM app...
"%ADB_PATH%" shell am start -n com.mdm.app/.MainActivity
echo ✓ App launched

echo.
echo 3. Monitoring app logs (Press Ctrl+C to stop)...
echo.
echo "Watch for:"
echo "- WebSocket connection attempts"
echo "- Button click events"
echo "- Error messages"
echo "- Enrollment attempts"
echo.
pause

echo Starting log monitoring...
"%ADB_PATH%" logcat -s "MDMService" "MainActivity" "WebSocketClient" "DevicePolicyManager"