@echo off
echo ========================================
echo      MDM App Testing Commands
echo ========================================

set ADB_PATH=C:\Users\allan.agaba\AppData\Local\Android\Sdk\platform-tools\adb.exe

echo Available commands:
echo.
echo 1. Check if app is installed
echo 2. Launch MDM app
echo 3. View app logs
echo 4. Check device admin status
echo 5. Uninstall app
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto check_app
if "%choice%"=="2" goto launch_app
if "%choice%"=="3" goto view_logs
if "%choice%"=="4" goto check_admin
if "%choice%"=="5" goto uninstall_app

:check_app
echo.
echo Checking if MDM app is installed...
"%ADB_PATH%" shell pm list packages | findstr com.mdm.app
if %ERRORLEVEL% EQU 0 (
    echo ✓ MDM app is installed
) else (
    echo ✗ MDM app is not installed
)
goto end

:launch_app
echo.
echo Launching MDM app...
"%ADB_PATH%" shell am start -n com.mdm.app/.MainActivity
echo App should launch in the emulator now.
goto end

:view_logs
echo.
echo Viewing MDM app logs (Press Ctrl+C to stop)...
"%ADB_PATH%" logcat -s "MDMService" "MainActivity" "WebSocketClient" "DevicePolicyManager"
goto end

:check_admin
echo.
echo Checking device admin status...
"%ADB_PATH%" shell dpm list-owners
goto end

:uninstall_app
echo.
echo Uninstalling MDM app...
"%ADB_PATH%" uninstall com.mdm.app
if %ERRORLEVEL% EQU 0 (
    echo ✓ App uninstalled successfully
) else (
    echo ✗ Failed to uninstall app
)
goto end

:end
echo.
pause