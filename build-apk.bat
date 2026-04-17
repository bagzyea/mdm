@echo off
REM =============================================
REM MDM Android APK Build Script
REM =============================================

echo.
echo =====================================
echo    MDM Android APK Builder
echo =====================================
echo.

REM Set variables
set PROJECT_DIR=%~dp0android-app
set OUTPUT_DIR=%~dp0build-output
set TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

echo Project Directory: %PROJECT_DIR%
echo Output Directory: %OUTPUT_DIR%
echo Build Timestamp: %TIMESTAMP%
echo.

REM Create output directory
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM Change to project directory
cd /d "%PROJECT_DIR%"

echo =====================================
echo    Step 1: Clean Previous Builds
echo =====================================
gradlew.bat clean
if %ERRORLEVEL% neq 0 (
    echo ERROR: Clean failed!
    pause
    exit /b 1
)
echo Clean completed successfully!
echo.

echo =====================================
echo    Step 2: Build Debug APK
echo =====================================
gradlew.bat assembleDebug
if %ERRORLEVEL% neq 0 (
    echo ERROR: Debug build failed!
    pause
    exit /b 1
)

REM Copy debug APK
if exist "app\build\outputs\apk\debug\app-debug.apk" (
    copy "app\build\outputs\apk\debug\app-debug.apk" "%OUTPUT_DIR%\MDM-debug-%TIMESTAMP%.apk"
    echo Debug APK copied to: %OUTPUT_DIR%\MDM-debug-%TIMESTAMP%.apk
) else (
    echo WARNING: Debug APK not found!
)
echo.

echo =====================================
echo    Step 3: Run Tests
echo =====================================
gradlew.bat test
if %ERRORLEVEL% neq 0 (
    echo WARNING: Some tests failed!
) else (
    echo All tests passed!
)
echo.

echo =====================================
echo    Step 4: Build Release APK
echo =====================================
gradlew.bat assembleRelease
if %ERRORLEVEL% neq 0 (
    echo ERROR: Release build failed!
    echo This is normal if you haven't configured signing keys.
    echo The debug APK is still available for testing.
) else (
    REM Copy release APK if successful
    if exist "app\build\outputs\apk\release\app-release-unsigned.apk" (
        copy "app\build\outputs\apk\release\app-release-unsigned.apk" "%OUTPUT_DIR%\MDM-release-unsigned-%TIMESTAMP%.apk"
        echo Release APK copied to: %OUTPUT_DIR%\MDM-release-unsigned-%TIMESTAMP%.apk
    )
)
echo.

echo =====================================
echo    Build Summary
echo =====================================
echo Build completed at: %date% %time%
echo.
echo Output files in: %OUTPUT_DIR%
dir "%OUTPUT_DIR%\*.apk" /b 2>nul
echo.
echo =====================================
echo    Next Steps
echo =====================================
echo 1. Install the debug APK on your device for testing:
echo    adb install "%OUTPUT_DIR%\MDM-debug-%TIMESTAMP%.apk"
echo.
echo 2. For production deployment, you'll need to:
echo    - Generate a signing keystore
echo    - Configure signing in build.gradle
echo    - Build a signed release APK
echo.
echo Build script completed!
pause