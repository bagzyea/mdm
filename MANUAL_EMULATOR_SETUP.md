# 📱 Manual Android Emulator Setup & Testing Guide

Since we're having some command-line environment issues, here's a step-by-step manual approach to get your MDM app running in the Android emulator.

## 🛠️ **Step 1: Build the Android App**

### Option A: Use Android Studio (Recommended)
1. **Open Android Studio**
2. **Open Project**: Navigate to `C:\code\MDM\android-app`
3. **Wait for Gradle Sync**: Let Android Studio automatically sync the project
4. **Build Menu**: Click `Build → Build Bundle(s) / APK(s) → Build APK(s)`
5. **Wait for Build**: Should take 2-5 minutes
6. **Success**: You'll see "APK(s) generated successfully"

### Option B: Command Line Build
If you want to try command line again:
1. **Open Command Prompt as Administrator**
2. **Set Environment Variables**:
   ```cmd
   set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot
   set ANDROID_HOME=C:\Users\allan.agaba\AppData\Local\Android\Sdk
   set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%
   ```
3. **Navigate to Project**:
   ```cmd
   cd C:\code\MDM\android-app
   ```
4. **Build**:
   ```cmd
   gradlew.bat assembleDebug
   ```

**Expected APK Location**: `C:\code\MDM\android-app\app\build\outputs\apk\debug\app-debug.apk`

## 📱 **Step 2: Create Android Virtual Device (AVD)**

### Using Android Studio AVD Manager
1. **Open Android Studio**
2. **Tools Menu**: Go to `Tools → AVD Manager`
3. **Create Virtual Device**: Click the `+ Create Virtual Device` button
4. **Select Hardware**: 
   - Choose **"Pixel 8"** or **"Pixel 7"**
   - Click **"Next"**
5. **Select System Image**:
   - **API Level 35 (Android 15.0)** - Latest (recommended)
   - **API Level 34 (Android 14.0)** - Stable option
   - **API Level 30 (Android 11.0)** - Minimum supported
   - Click **"Download"** if not already downloaded
   - Click **"Next"**
6. **Verify Configuration**:
   - **AVD Name**: `MDM_Test_Device`
   - **Startup Orientation**: Portrait
   - **Click "Show Advanced Settings"**:
     - **RAM**: 4096 MB
     - **VM Heap**: 512 MB
     - **Internal Storage**: 8192 MB
     - **SD Card**: 1024 MB
7. **Click "Finish"**

## 🚀 **Step 3: Start the Emulator**

### From Android Studio
1. **AVD Manager**: Open `Tools → AVD Manager`
2. **Launch**: Click the **Play (▶️)** button next to `MDM_Test_Device`
3. **Wait for Boot**: Usually takes 2-3 minutes for first boot
4. **Ready**: When you see the Android home screen

### From Command Line (Alternative)
```cmd
C:\Users\allan.agaba\AppData\Local\Android\Sdk\emulator\emulator.exe -avd MDM_Test_Device
```

## 📦 **Step 4: Install the MDM App**

### Method A: Using Android Studio
1. **Open Project**: `C:\code\MDM\android-app` in Android Studio
2. **Select Device**: In the device dropdown, select your running emulator
3. **Run App**: Click the **Run (▶️)** button or press `Shift + F10`
4. **Automatic Install**: Android Studio will build and install automatically

### Method B: Using ADB Command Line
1. **Open Command Prompt**
2. **Navigate to Platform Tools**:
   ```cmd
   cd C:\Users\allan.agaba\AppData\Local\Android\Sdk\platform-tools
   ```
3. **Check Device Connection**:
   ```cmd
   adb.exe devices
   ```
   You should see your emulator listed (e.g., `emulator-5554`)
4. **Install APK**:
   ```cmd
   adb.exe install "C:\code\MDM\android-app\app\build\outputs\apk\debug\app-debug.apk"
   ```

### Method C: Drag and Drop
1. **Open File Explorer**: Navigate to `C:\code\MDM\android-app\app\build\outputs\apk\debug\`
2. **Drag APK**: Drag `app-debug.apk` onto the emulator screen
3. **Install**: Follow the installation prompts in the emulator

## 🧪 **Step 5: Test the MDM App**

### Initial App Launch
1. **Find the App**: Look for "MDM App" or "UBOS MDM" in the app drawer
2. **Launch**: Tap the app icon
3. **First Run**: You should see the main MDM interface

### Basic Functionality Tests

#### **1. Device Admin Setup**
- **Enable Admin**: Tap "Enable Device Admin" button
- **Grant Permissions**: Accept the device admin request
- **Verify**: Status should show "Device Admin: Active"

#### **2. Permissions**
- **Location**: Grant location permissions when prompted
- **Storage**: Grant storage permissions if asked
- **Phone**: Grant phone permissions for device info

#### **3. Server Connection**
- **Configure**: Enter your server URL (if you have a backend running)
- **Test Connection**: Tap "Test Connection"
- **WebSocket**: Check if WebSocket connection establishes

#### **4. MDM Features**
- **Device Info**: Verify device information displays
- **Policy Status**: Check policy compliance status
- **Commands**: Test if remote commands can be received

## 🐛 **Troubleshooting**

### **App Won't Install**
```cmd
# Uninstall existing version
adb.exe uninstall com.mdm.app

# Clear package data
adb.exe shell pm clear com.mdm.app

# Try installing again
adb.exe install -r "path\to\app-debug.apk"
```

### **Emulator Issues**
- **Slow Performance**: Increase RAM to 6GB in AVD settings
- **Won't Start**: Try creating a new AVD with different API level
- **No Internet**: Check emulator network settings

### **Build Issues**
- **Java Not Found**: Verify Java 17 installation
- **Gradle Issues**: Try `gradlew.bat clean` first
- **Dependencies**: Check internet connection for downloads

## 📊 **Expected Test Results**

### **✅ Successful Launch Indicators**
- App opens without crashes
- Main UI displays properly
- Material Design 3 theme is visible
- Device admin prompt appears

### **✅ Working MDM Features**
- Device admin can be enabled
- Device information displays
- WebSocket connection status shows
- Permissions are requested properly

### **✅ Performance Metrics**
- App launch time: < 3 seconds
- Memory usage: < 100MB
- Smooth UI interactions
- No visible lag or stuttering

## 🎯 **Next Steps After Successful Setup**

1. **Backend Integration**: Connect to your MDM backend server
2. **Policy Testing**: Apply test policies from admin dashboard
3. **Remote Commands**: Test command execution
4. **Real Device Testing**: Install on physical Android device
5. **Production Setup**: Configure for production environment

## 📞 **Need Help?**

If you encounter issues:
1. **Check Android Studio Logs**: Look for build errors
2. **Check Emulator Logs**: Use `adb logcat` for runtime issues  
3. **Verify Environment**: Ensure Java 17 and Android SDK are properly configured
4. **Try Different AVD**: Some system images work better than others

---

**🎉 Once you complete these steps, your MDM Android app will be running in the emulator and ready for comprehensive testing!**