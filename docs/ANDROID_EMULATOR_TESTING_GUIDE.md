# 🚀 Android MDM App - Emulator Testing Guide

## 📱 **Prerequisites**

### ✅ **Environment Setup** (Already Configured)
- **Java 17**: Installed at `C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot`
- **Android SDK**: Installed at `C:\Users\allan.agaba\AppData\Local\Android\Sdk`
- **Android Studio**: Available for advanced emulator management
- **Build Tools**: Versions 33.0.1, 34.0.0, and 36.0.0 available

## 🛠️ **Step 1: Build the Application**

### Option A: Using the Build Script (Recommended)
```bash
cd android-app
.\build-debug.bat
```

### Option B: Manual Build
```bash
cd android-app
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot
set ANDROID_HOME=C:\Users\allan.agaba\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%
.\gradlew.bat assembleDebug
```

**Expected Output**: APK file will be generated at:
`android-app\app\build\outputs\apk\debug\app-debug.apk`

## 📱 **Step 2: Create Android Virtual Device (AVD)**

### Using Android Studio (Recommended)
1. **Open Android Studio**
2. **Go to Tools → AVD Manager**
3. **Click "Create Virtual Device"**
4. **Select Device**: Choose "Pixel 8" or "Pixel 7" for modern Android testing
5. **Select System Image**: 
   - **API Level 35 (Android 15)** - For latest testing
   - **API Level 34 (Android 14)** - For compatibility testing
   - **API Level 30 (Android 11)** - Minimum supported version
6. **Configure AVD**:
   - **Name**: `MDM_Test_Device`
   - **RAM**: 4GB (recommended)
   - **Internal Storage**: 8GB
   - **SD Card**: 1GB (for file testing)
7. **Advanced Settings**:
   - **Graphics**: Hardware - GLES 2.0
   - **Multi-Core CPU**: 4 cores
   - **Enable**: Device Admin API support

### Using Command Line
```bash
# List available system images
%ANDROID_HOME%\cmdline-tools\latest\bin\avdmanager.bat list targets

# Create AVD
%ANDROID_HOME%\cmdline-tools\latest\bin\avdmanager.bat create avd ^
  -n MDM_Test_Device ^
  -k "system-images;android-35;google_apis;x86_64" ^
  -d "pixel_8"
```

## 🚀 **Step 3: Start the Emulator**

### Using Android Studio
1. **Open AVD Manager**
2. **Click the Play (▶️) button** next to `MDM_Test_Device`
3. **Wait for boot completion** (usually 2-3 minutes)

### Using Command Line
```bash
cd %ANDROID_HOME%\emulator
emulator.exe -avd MDM_Test_Device -no-snapshot-load
```

**Advanced Emulator Options**:
```bash
# For faster performance
emulator.exe -avd MDM_Test_Device -gpu host -memory 4096

# For debugging network issues
emulator.exe -avd MDM_Test_Device -dns-server 8.8.8.8
```

## 📦 **Step 4: Install and Test the MDM App**

### Install APK
```bash
cd android-app
%ANDROID_HOME%\platform-tools\adb.exe install app\build\outputs\apk\debug\app-debug.apk
```

### Alternative: Install with Force Update
```bash
%ANDROID_HOME%\platform-tools\adb.exe install -r app\build\outputs\apk\debug\app-debug.apk
```

### Verify Installation
```bash
%ANDROID_HOME%\platform-tools\adb.exe shell pm list packages | findstr com.mdm.app
```

## 🧪 **Step 5: Testing Scenarios**

### **Basic Functionality Tests**

1. **Launch the App**
   ```bash
   %ANDROID_HOME%\platform-tools\adb.exe shell am start -n com.mdm.app/.MainActivity
   ```

2. **Test Device Admin Enrollment**
   - Open the app
   - Click "Enable Device Admin"
   - Grant admin permissions when prompted
   - Verify admin status shows as "Active"

3. **Test Network Connectivity**
   - Configure server URL in app settings
   - Test connection to your backend server
   - Verify WebSocket connection status

4. **Test Policy Enforcement**
   - Apply a test policy from admin dashboard
   - Verify policy is received and applied on device
   - Check compliance status

### **Advanced Testing Scenarios**

#### **Kiosk Mode Testing**
```bash
# Enable kiosk mode from app
# Test that device is locked to the app
# Verify navigation restrictions
```

#### **Location Services Testing**
```bash
# Set mock location in emulator
%ANDROID_HOME%\platform-tools\adb.exe emu geo fix -122.084 37.4219

# Test geofencing alerts
# Verify location reporting
```

#### **App Management Testing**
```bash
# Test app installation blocking
# Test app uninstallation restrictions
# Verify app whitelist/blacklist enforcement
```

## 🐛 **Step 6: Debugging and Monitoring**

### **View Real-time Logs**
```bash
# MDM App logs
%ANDROID_HOME%\platform-tools\adb.exe logcat -s "MDMService" "MainActivity" "WebSocketClient"

# All app logs
%ANDROID_HOME%\platform-tools\adb.exe logcat | findstr "com.mdm.app"

# System admin logs
%ANDROID_HOME%\platform-tools\adb.exe logcat -s "DevicePolicyManager"
```

### **Monitor Network Traffic**
```bash
# Enable network monitoring
%ANDROID_HOME%\platform-tools\adb.exe shell settings put global http_proxy <proxy_host:port>

# Monitor WebSocket connections
%ANDROID_HOME%\platform-tools\adb.exe logcat -s "WebSocket" "OkHttp"
```

### **Database Inspection**
```bash
# Access app database
%ANDROID_HOME%\platform-tools\adb.exe shell
sqlite3 /data/data/com.mdm.app/databases/mdm_database.db
.tables
.schema
SELECT * FROM device_info;
```

## 📊 **Step 7: Performance Testing**

### **Memory Usage**
```bash
# Monitor memory usage
%ANDROID_HOME%\platform-tools\adb.exe shell dumpsys meminfo com.mdm.app
```

### **Battery Impact**
```bash
# Monitor battery usage
%ANDROID_HOME%\platform-tools\adb.exe shell dumpsys batterystats com.mdm.app
```

### **CPU Usage**
```bash
# Monitor CPU usage
%ANDROID_HOME%\platform-tools\adb.exe shell top | findstr com.mdm.app
```

## 🔒 **Step 8: Security Testing**

### **Certificate Pinning**
```bash
# Test with invalid certificates
# Verify connection failures with wrong certs
# Test certificate rotation scenarios
```

### **Data Encryption**
```bash
# Verify local data encryption
# Test secure storage implementation
# Check for sensitive data in logs
```

### **Permission Testing**
```bash
# Test permission requests
# Verify graceful degradation
# Test runtime permission scenarios
```

## 🚨 **Troubleshooting Common Issues**

### **Emulator Won't Start**
```bash
# Clear AVD cache
%ANDROID_HOME%\emulator\emulator.exe -avd MDM_Test_Device -wipe-data

# Check hardware acceleration
%ANDROID_HOME%\emulator\emulator.exe -accel-check
```

### **App Won't Install**
```bash
# Clear package data
%ANDROID_HOME%\platform-tools\adb.exe shell pm clear com.mdm.app

# Uninstall and reinstall
%ANDROID_HOME%\platform-tools\adb.exe uninstall com.mdm.app
%ANDROID_HOME%\platform-tools\adb.exe install app\build\outputs\apk\debug\app-debug.apk
```

### **Device Admin Issues**
```bash
# Check device admin status
%ANDROID_HOME%\platform-tools\adb.exe shell dpm list-owners

# Reset device admin
%ANDROID_HOME%\platform-tools\adb.exe shell dpm remove-active-admin com.mdm.app/.admin.MDMDeviceAdminReceiver
```

### **Network Connection Issues**
```bash
# Check network connectivity
%ANDROID_HOME%\platform-tools\adb.exe shell ping google.com

# Test specific ports
%ANDROID_HOME%\platform-tools\adb.exe shell telnet <your_server_ip> <port>
```

## 🎯 **Testing Checklist**

### **✅ Basic Functionality**
- [ ] App launches successfully
- [ ] UI loads correctly
- [ ] Device admin enrollment works
- [ ] Server connection established
- [ ] WebSocket connection stable

### **✅ MDM Features**
- [ ] Policy application works
- [ ] Remote commands execute
- [ ] Device status reporting
- [ ] App management functions
- [ ] Location services active

### **✅ Security Features**
- [ ] Certificate pinning works
- [ ] Data encryption verified
- [ ] Secure storage functional
- [ ] Admin privileges protected
- [ ] Audit logging active

### **✅ Performance**
- [ ] App launch time < 3 seconds
- [ ] Memory usage < 100MB
- [ ] Battery impact minimal
- [ ] Network efficiency good
- [ ] UI responsiveness smooth

## 📈 **Next Steps**

1. **Production Testing**: Test on real Android devices
2. **Integration Testing**: Test with full backend infrastructure
3. **Load Testing**: Test with multiple devices
4. **Security Audit**: Professional security assessment
5. **User Acceptance Testing**: Test with actual MDM administrators

## 📞 **Support Resources**

- **Android Developer Docs**: https://developer.android.com/
- **MDM Best Practices**: https://developer.android.com/work/
- **Emulator Documentation**: https://developer.android.com/studio/run/emulator
- **ADB Command Reference**: https://developer.android.com/studio/command-line/adb

---

**🎉 The MDM Android app is now ready for comprehensive testing in the emulator environment!**