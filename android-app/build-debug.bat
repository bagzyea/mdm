@echo off
echo ========================================
echo      MDM Android App Build Script
echo ========================================

REM Set environment variables
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot
set ANDROID_HOME=C:\Users\allan.agaba\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%ANDROID_HOME%\tools;%ANDROID_HOME%\tools\bin;%PATH%

echo Environment Setup:
echo JAVA_HOME: %JAVA_HOME%
echo ANDROID_HOME: %ANDROID_HOME%
echo.

REM Check Java version
echo Checking Java version...
java -version
echo.

REM Check Gradle wrapper
echo Checking Gradle wrapper...
if exist gradlew.bat (
    echo ✓ Gradle wrapper found
) else (
    echo ✗ Gradle wrapper not found
    goto :error
)
echo.

REM Clean and build
echo Cleaning previous build...
gradlew.bat clean

echo.
echo Building debug APK...
gradlew.bat assembleDebug

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo          BUILD SUCCESSFUL!
    echo ========================================
    echo APK Location: app\build\outputs\apk\debug\app-debug.apk
    echo.
    dir app\build\outputs\apk\debug\*.apk
) else (
    echo.
    echo ========================================
    echo           BUILD FAILED!
    echo ========================================
    goto :error
)

goto :end

:error
echo.
echo Build encountered errors. Check the output above.
pause
exit /b 1

:end
echo.
echo Build completed successfully!
pause