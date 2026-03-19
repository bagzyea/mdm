# 📱 **MDM APK Testing Guide**

## **Installation Methods**

### **Method 1: Using ADB (Recommended)**
```bash
# Install debug APK
adb install build-output/MDM-debug-[timestamp].apk

# Install release APK (if signed)
adb install build-output/MDM-release-[timestamp].apk

# If app already installed, use -r to reinstall
adb install -r build-output/MDM-debug-[timestamp].apk
```

### **Method 2: Direct Installation on Device**
1. Transfer APK to device (email, cloud storage, etc.)
2. Enable "Unknown Sources" in device settings
3. Tap the APK file to install

### **Method 3: Using Android Studio**
1. Open project in Android Studio
2. Connect device via USB
3. Click "Run" button or use `Shift+F10`

## **Pre-Installation Requirements**

### **Device Requirements:**
- Android 11 (API 30) or higher
- Minimum 50MB free storage
- Internet connection for MDM server communication

### **Permissions to Grant:**
The app will request these permissions during first launch:
- ✅ **Location Access** - For device tracking
- ✅ **Storage Access** - For file management  
- ✅ **Device Admin** - **CRITICAL** for MDM functionality
- ✅ **System Alert Window** - For kiosk mode
- ✅ **Install Apps** - For app management

## **Testing Checklist**

### **✅ Basic Functionality Test**
- [ ] App launches without crashes
- [ ] UI loads correctly
- [ ] Server URL can be configured
- [ ] Device admin activation works

### **✅ Device Admin Test**
- [ ] Device admin prompt appears
- [ ] Admin permissions granted successfully
- [ ] Device lock works (if tested safely)
- [ ] Kiosk mode can be enabled (if tested safely)

### **✅ Network Connectivity Test**
- [ ] WebSocket connection establishes
- [ ] API calls succeed
- [ ] Heartbeat messages sent
- [ ] Commands received from server

### **✅ Device Information Collection**
- [ ] Device ID generated
- [ ] Hardware info collected correctly
- [ ] Battery level reported
- [ ] Location data collected (if permission granted)
- [ ] Installed apps list generated

## **Common Issues & Solutions**

### **🔴 Installation Failed**
- **Issue**: "App not installed" error
- **Solution**: 
  - Enable "Unknown Sources" in Settings
  - Check available storage space
  - Try uninstalling previous version first

### **🔴 Device Admin Not Working**
- **Issue**: Device admin permissions denied
- **Solution**:
  - Go to Settings → Security → Device Admin Apps
  - Manually enable MDM app
  - Restart the app

### **🔴 Network Connection Failed**
- **Issue**: Cannot connect to MDM server
- **Solution**:
  - Check server URL format (must include protocol)
  - Verify server is running and accessible
  - Check device internet connection
  - Review network security config

### **🔴 Permissions Denied**
- **Issue**: App crashes due to missing permissions
- **Solution**:
  - Go to Settings → Apps → MDM → Permissions
  - Grant all requested permissions
  - Restart the app

## **Debug Information**

### **View Logs:**
```bash
# View app logs
adb logcat -s MDMService,MainActivity,PolicyEngine

# Clear logs and view fresh
adb logcat -c && adb logcat -s MDM*

# Save logs to file
adb logcat -s MDM* > mdm-debug.log
```

### **Useful ADB Commands:**
```bash
# Check device info
adb shell getprop ro.build.version.release
adb shell getprop ro.product.model

# Check app info
adb shell pm list packages | grep mdm
adb shell pm dump com.mdm.app | grep version

# Force stop app
adb shell am force-stop com.mdm.app

# Launch app
adb shell am start -n com.mdm.app/.MainActivity
```

## **Security Testing**

### **Certificate Pinning Test:**
- Try connecting with invalid certificates
- Verify app rejects invalid SSL certificates
- Test with proxy tools (should fail if pinning works)

### **Data Encryption Test:**
- Check that sensitive data is encrypted in SharedPreferences
- Verify network traffic uses HTTPS
- Test that authentication tokens are properly secured

### **Device Admin Security Test:**
- Verify device lock works
- Test policy enforcement
- Ensure unauthorized apps cannot disable admin

## **Performance Testing**

### **Memory Usage:**
```bash
# Check memory usage
adb shell dumpsys meminfo com.mdm.app
```

### **Battery Impact:**
- Monitor battery usage in device settings
- Should be minimal in background
- Check for wake locks and excessive CPU usage

### **Network Usage:**
- Monitor data usage
- Verify heartbeat intervals are reasonable
- Check for unnecessary API calls

## **Production Deployment Checklist**

- [ ] Release APK is properly signed
- [ ] Certificate pinning configured with production certificates
- [ ] Server URLs point to production environment
- [ ] Debug logging disabled
- [ ] ProGuard/R8 obfuscation enabled
- [ ] All permissions properly documented
- [ ] Testing completed on target devices
- [ ] Performance benchmarks meet requirements