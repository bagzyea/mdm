# MDM Android App Build Script (PowerShell)
Write-Host "========================================" -ForegroundColor Green
Write-Host "      MDM Android App Build Script" -ForegroundColor Green  
Write-Host "========================================" -ForegroundColor Green

# Set environment variables
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot"
$env:ANDROID_HOME = "C:\Users\allan.agaba\AppData\Local\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"

Write-Host "Environment Setup:" -ForegroundColor Yellow
Write-Host "JAVA_HOME: $env:JAVA_HOME"
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"
Write-Host ""

# Check Java version
Write-Host "Checking Java version..." -ForegroundColor Yellow
try {
    & java -version
    Write-Host "✓ Java is working" -ForegroundColor Green
}
catch {
    Write-Host "✗ Java not found" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Check Gradle wrapper
Write-Host "Checking Gradle wrapper..." -ForegroundColor Yellow
if (Test-Path "gradlew.bat") {
    Write-Host "✓ Gradle wrapper found" -ForegroundColor Green
}
else {
    Write-Host "✗ Gradle wrapper not found" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Clean previous build
Write-Host "Cleaning previous build..." -ForegroundColor Yellow
& .\gradlew.bat clean

Write-Host ""
Write-Host "Building debug APK..." -ForegroundColor Yellow
& .\gradlew.bat assembleDebug

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "          BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "APK Location: app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if APK was created
    $apkPath = "app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        $apkSize = (Get-Item $apkPath).Length
        Write-Host "✓ APK created successfully" -ForegroundColor Green
        Write-Host "  Size: $([math]::Round($apkSize/1MB, 2)) MB" -ForegroundColor Cyan
    }
    else {
        Write-Host "✗ APK not found" -ForegroundColor Red
    }
}
else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "           BUILD FAILED!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Check the output above for error details." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Build completed successfully!" -ForegroundColor Green