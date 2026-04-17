@echo off
echo ========================================
echo    Installing MDM Android App
echo ========================================

set APK_PATH=android-app\app\build\outputs\apk\debug\app-debug.apk
set ADB_PATH=C:\Users\allan.agaba\AppData\Local\Android\Sdk\platform-tools\adb.exe

echo Checking if APK exists...
if not exist "%APK_PATH%" (
    echo ✗ APK not found: %APK_PATH%
    echo   Please build the app first.
    pause
    exit /b 1
)
echo ✓ APK found: %APK_PATH%

echo.
echo Checking if ADB is available...
if not exist "%ADB_PATH%" (
    echo ✗ ADB not found: %ADB_PATH%
    echo   Please check Android SDK installation.
    pause
    exit /b 1
)
echo ✓ ADB found: %ADB_PATH%

echo.
echo Checking connected devices...
"%ADB_PATH%" devices

echo.
echo Installing APK...
"%ADB_PATH%" install -r "%APK_PATH%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo      INSTALLATION SUCCESSFUL!
    echo ========================================
    echo.
    echo The MDM app should now be available in your emulator.
    echo Look for "MDM App" or "UBOS MDM" in the app drawer.
    echo.
    echo To launch the app from command line:
    echo %ADB_PATH% shell am start -n com.mdm.app/.MainActivity
) else (
    echo.
    echo ========================================
    echo       INSTALLATION FAILED!
    echo ========================================
    echo.
    echo Possible issues:
    echo 1. Emulator not running
    echo 2. USB debugging not enabled
    echo 3. Previous installation conflicts
    echo.
    echo Try uninstalling first:
    echo %ADB_PATH% uninstall com.mdm.app
)

echo.
pause