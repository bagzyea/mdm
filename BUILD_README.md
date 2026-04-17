# 🏗️ **MDM Android App - Build Instructions**

## **Quick Start**

### **1️⃣ Environment Check**
```bash
# Windows
check-environment.bat

# Linux/macOS  
./check-environment.sh
```

### **2️⃣ Build APK**
```bash
# Windows
build-apk.bat

# Linux/macOS
./build-apk.sh
```

### **3️⃣ Install & Test**
```bash
# Install debug APK
adb install build-output/MDM-debug-[timestamp].apk
```

## **Detailed Setup**

### **Prerequisites**
- ☑️ **Java JDK 11+** ([Download](https://adoptium.net/))
- ☑️ **Android SDK** (via Android Studio or standalone)
- ☑️ **Android Device** (API 30+) or Emulator

### **Environment Setup**

#### **Option A: Android Studio (Recommended)**
1. Download [Android Studio](https://developer.android.com/studio)
2. Install with default settings
3. Open project: `File → Open → android-app`
4. Sync project and download dependencies
5. Click ▶️ Run button to build and install

#### **Option B: Command Line**
1. Download Android SDK command-line tools
2. Set environment variables:
   ```bash
   export ANDROID_HOME=/path/to/android/sdk
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
   ```
3. Install required SDK components:
   ```bash
   sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
   ```

## **Build Types**

### **🔧 Debug Build**
- **Purpose**: Development and testing
- **Signing**: Debug keystore (automatic)
- **Features**: Debugging enabled, detailed logging
- **Command**: `./gradlew assembleDebug`

### **🚀 Release Build**
- **Purpose**: Production deployment
- **Signing**: Requires release keystore setup
- **Features**: Optimized, obfuscated, minimal logging
- **Command**: `./gradlew assembleRelease`

## **Build Configuration**

### **Current Settings:**
```gradle
android {
    compileSdk 34
    minSdk 30      // Android 11+
    targetSdk 34   // Android 14
    
    buildTypes {
        debug {
            applicationIdSuffix ".debug"
            versionNameSuffix "-debug"
        }
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles 'proguard-rules.pro'
        }
    }
}
```

### **Key Features:**
- ✅ **ProGuard/R8** enabled for release
- ✅ **Resource shrinking** for smaller APK
- ✅ **Certificate pinning** for security
- ✅ **Network security config** 
- ✅ **Modern Android permissions** (API 30+)

## **Output Files**

After building, APKs are located in:
```
build-output/
├── MDM-debug-20240809_143022.apk      # Debug version
└── MDM-release-unsigned-20240809.apk  # Release (if unsigned)
```

### **APK Information:**
- **Size**: ~15-25 MB (depending on build type)
- **Target**: Android 11+ (API 30+)
- **Permissions**: Device Admin, Location, Storage, Network
- **Architecture**: Universal (supports all device types)

## **Signing for Production**

### **Generate Release Keystore:**
```bash
keytool -genkey -v -keystore mdm-release-key.keystore \
    -alias mdm-key -keyalg RSA -keysize 2048 -validity 10000
```

### **Configure Signing:**
See detailed instructions in: [`KEYSTORE_SETUP.md`](KEYSTORE_SETUP.md)

## **Testing**

### **Installation:**
```bash
# Basic install
adb install build-output/MDM-debug-[timestamp].apk

# Reinstall over existing
adb install -r build-output/MDM-debug-[timestamp].apk

# Install on specific device (if multiple connected)
adb -s [device-id] install build-output/MDM-debug-[timestamp].apk
```

### **Testing Guide:**
Complete testing instructions: [`APK_TESTING_GUIDE.md`](APK_TESTING_GUIDE.md)

## **Troubleshooting**

### **Build Failures:**

#### **"Java not found"**
- Install Java JDK 11+
- Set JAVA_HOME environment variable
- Add Java to PATH

#### **"Android SDK not found"**
- Install Android SDK
- Set ANDROID_HOME environment variable
- Install required SDK components

#### **"Gradle build failed"**
- Check internet connection (downloads dependencies)
- Clear Gradle cache: `./gradlew clean`
- Delete `.gradle` folder and rebuild

#### **"Dependencies could not be resolved"**
- Check internet connection
- Clear Gradle cache
- Update repository URLs in build.gradle

### **Installation Failures:**

#### **"App not installed"**
- Enable "Unknown Sources" in device settings
- Check available storage space
- Uninstall previous version first

#### **"Signature mismatch"**
- Different signing keys between versions
- Uninstall previous version completely
- Or use same signing key

## **Advanced Configuration**

### **Custom Build Properties:**
Create `gradle.properties` file:
```properties
# Custom server URL for debug builds
DEBUG_SERVER_URL=http://your-dev-server.com/api/

# Enable/disable features
ENABLE_CERTIFICATE_PINNING=true
ENABLE_DETAILED_LOGGING=false
```

### **Build Variants:**
```bash
# Build all variants
./gradlew assemble

# Build specific variant
./gradlew assembleDebug
./gradlew assembleRelease

# Build and run tests
./gradlew build
```

## **Continuous Integration**

### **GitHub Actions Example:**
```yaml
- name: Build Debug APK
  run: ./gradlew assembleDebug

- name: Upload APK
  uses: actions/upload-artifact@v2
  with:
    name: debug-apk
    path: app/build/outputs/apk/debug/app-debug.apk
```

## **Support**

### **Build Issues:**
- Check environment with `check-environment.bat`
- Review build logs in `android-app/build/reports/`
- Verify all dependencies are available

### **Runtime Issues:**
- Use `adb logcat` to view application logs
- Check device compatibility (Android 11+)
- Verify all permissions are granted

### **Production Issues:**
- Ensure proper signing configuration
- Verify certificate pinning setup
- Test on multiple device types and Android versions