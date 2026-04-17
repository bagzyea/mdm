@echo off
echo ========================================
echo    Checking MDM Android App Build
echo ========================================

set APK_PATH=android-app\app\build\outputs\apk\debug\app-debug.apk

if exist "%APK_PATH%" (
    echo ✓ APK Found: %APK_PATH%
    
    REM Get file size
    for %%A in ("%APK_PATH%") do set APK_SIZE=%%~zA
    set /a APK_SIZE_MB=%APK_SIZE%/1048576
    echo   Size: %APK_SIZE_MB% MB
    
    REM Get file date
    for %%A in ("%APK_PATH%") do echo   Modified: %%~tA
    
    echo.
    echo ✓ Build appears successful!
    echo   You can now proceed with emulator setup.
    
) else (
    echo ✗ APK Not Found: %APK_PATH%
    echo.
    echo   Build may have failed or not completed.
    echo   Try building the app first:
    echo   1. Open Android Studio
    echo   2. Open project: android-app folder  
    echo   3. Build → Build APK(s)
    echo.
)

echo.
echo Available build outputs:
dir android-app\app\build\outputs\apk\debug\ 2>nul

pause