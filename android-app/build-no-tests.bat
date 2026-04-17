@echo off
echo ========================================
echo    Building MDM Android App (No Tests)
echo ========================================

set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
set "ANDROID_HOME=C:\Users\allan.agaba\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

echo JAVA_HOME: %JAVA_HOME%
echo ANDROID_HOME: %ANDROID_HOME%
echo.

echo Building APK without running tests...
gradlew.bat assembleDebug -x test -x testDebugUnitTest

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo          BUILD SUCCESSFUL!
    echo ========================================
    echo APK should be at: app\build\outputs\apk\debug\app-debug.apk
    dir app\build\outputs\apk\debug\*.apk 2>nul
) else (
    echo.
    echo BUILD FAILED - Check errors above
)

pause