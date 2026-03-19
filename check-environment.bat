@echo off
REM =============================================
REM Environment Check Script
REM =============================================

echo.
echo =====================================
echo    Environment Check for Android Build
echo =====================================
echo.

REM Check Java
echo Checking Java installation...
java -version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ Java not found in PATH
    echo Please install Java JDK 11 or higher
    echo Download from: https://adoptium.net/
) else (
    echo ✅ Java found:
    java -version 2>&1 | findstr "version"
)
echo.

REM Check Android SDK
echo Checking Android SDK...
if exist "%ANDROID_HOME%" (
    echo ✅ ANDROID_HOME set to: %ANDROID_HOME%
) else (
    echo ❌ ANDROID_HOME not set
    echo Please set ANDROID_HOME environment variable to your Android SDK path
)
echo.

REM Check ADB
echo Checking ADB (Android Debug Bridge)...
adb version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ ADB not found in PATH
    echo Make sure Android SDK platform-tools are in your PATH
) else (
    echo ✅ ADB found:
    adb version | findstr "Android Debug Bridge"
)
echo.

REM Check Gradle Wrapper
echo Checking Gradle Wrapper...
cd /d "%~dp0android-app"
if exist "gradlew.bat" (
    echo ✅ Gradle wrapper found
    echo Running gradle check...
    gradlew.bat --version | findstr "Gradle"
) else (
    echo ❌ Gradle wrapper not found
    echo Make sure you're in the correct project directory
)
echo.

echo =====================================
echo    Environment Check Complete
echo =====================================
echo.
echo If all items show ✅, you're ready to build!
echo If any items show ❌, please install the missing components.
echo.
pause