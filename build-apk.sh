#!/bin/bash
# =============================================
# MDM Android APK Build Script (Linux/macOS)
# =============================================

echo ""
echo "====================================="
echo "    MDM Android APK Builder"
echo "====================================="
echo ""

# Set variables
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-app"
OUTPUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/build-output"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "Project Directory: $PROJECT_DIR"
echo "Output Directory: $OUTPUT_DIR"
echo "Build Timestamp: $TIMESTAMP"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Change to project directory
cd "$PROJECT_DIR"

echo "====================================="
echo "    Step 1: Clean Previous Builds"
echo "====================================="
./gradlew clean
if [ $? -ne 0 ]; then
    echo "ERROR: Clean failed!"
    exit 1
fi
echo "Clean completed successfully!"
echo ""

echo "====================================="
echo "    Step 2: Build Debug APK"
echo "====================================="
./gradlew assembleDebug
if [ $? -ne 0 ]; then
    echo "ERROR: Debug build failed!"
    exit 1
fi

# Copy debug APK
if [ -f "app/build/outputs/apk/debug/app-debug.apk" ]; then
    cp "app/build/outputs/apk/debug/app-debug.apk" "$OUTPUT_DIR/MDM-debug-$TIMESTAMP.apk"
    echo "Debug APK copied to: $OUTPUT_DIR/MDM-debug-$TIMESTAMP.apk"
else
    echo "WARNING: Debug APK not found!"
fi
echo ""

echo "====================================="
echo "    Step 3: Run Tests"
echo "====================================="
./gradlew test
if [ $? -ne 0 ]; then
    echo "WARNING: Some tests failed!"
else
    echo "All tests passed!"
fi
echo ""

echo "====================================="
echo "    Step 4: Build Release APK"
echo "====================================="
./gradlew assembleRelease
if [ $? -ne 0 ]; then
    echo "ERROR: Release build failed!"
    echo "This is normal if you haven't configured signing keys."
    echo "The debug APK is still available for testing."
else
    # Copy release APK if successful
    if [ -f "app/build/outputs/apk/release/app-release-unsigned.apk" ]; then
        cp "app/build/outputs/apk/release/app-release-unsigned.apk" "$OUTPUT_DIR/MDM-release-unsigned-$TIMESTAMP.apk"
        echo "Release APK copied to: $OUTPUT_DIR/MDM-release-unsigned-$TIMESTAMP.apk"
    fi
fi
echo ""

echo "====================================="
echo "    Build Summary"
echo "====================================="
echo "Build completed at: $(date)"
echo ""
echo "Output files in: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"/*.apk 2>/dev/null || echo "No APK files found"
echo ""
echo "====================================="
echo "    Next Steps"
echo "====================================="
echo "1. Install the debug APK on your device for testing:"
echo "   adb install '$OUTPUT_DIR/MDM-debug-$TIMESTAMP.apk'"
echo ""
echo "2. For production deployment, you'll need to:"
echo "   - Generate a signing keystore"
echo "   - Configure signing in build.gradle"
echo "   - Build a signed release APK"
echo ""
echo "Build script completed!"