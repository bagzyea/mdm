# 🔐 **Android App Signing Setup Guide**

For **production releases**, you need to sign your APK with a release keystore. Here's how:

## **Step 1: Generate Release Keystore**

### **Using Command Line:**
```bash
keytool -genkey -v -keystore mdm-release-key.keystore -alias mdm-key -keyalg RSA -keysize 2048 -validity 10000
```

### **Using Android Studio:**
1. Go to `Build → Generate Signed Bundle / APK`
2. Choose `APK`
3. Click `Create new...` to create a new keystore
4. Fill in the details and save the keystore file

## **Step 2: Configure Signing in build.gradle**

Add this to your `app/build.gradle` file:

```gradle
android {
    signingConfigs {
        release {
            storeFile file('path/to/your/mdm-release-key.keystore')
            storePassword 'your_store_password'
            keyAlias 'mdm-key'
            keyPassword 'your_key_password'
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            // ... other config
        }
    }
}
```

## **Step 3: Secure Keystore Credentials**

### **Option A: gradle.properties (Local)**
Create `gradle.properties` in your home directory:
```properties
MDM_STORE_FILE=path/to/your/mdm-release-key.keystore
MDM_STORE_PASSWORD=your_store_password
MDM_KEY_ALIAS=mdm-key
MDM_KEY_PASSWORD=your_key_password
```

Then update `app/build.gradle`:
```gradle
signingConfigs {
    release {
        storeFile file(MDM_STORE_FILE)
        storePassword MDM_STORE_PASSWORD
        keyAlias MDM_KEY_ALIAS
        keyPassword MDM_KEY_PASSWORD
    }
}
```

### **Option B: Environment Variables**
```gradle
signingConfigs {
    release {
        storeFile file(System.getenv("MDM_STORE_FILE") ?: "release-key.keystore")
        storePassword System.getenv("MDM_STORE_PASSWORD")
        keyAlias System.getenv("MDM_KEY_ALIAS")
        keyPassword System.getenv("MDM_KEY_PASSWORD")
    }
}
```

## **⚠️ Security Important:**
- **NEVER** commit keystores or passwords to version control
- Keep your keystore file safe and backed up
- Use strong passwords
- Store credentials securely

## **Step 4: Build Signed Release APK**
After configuring signing:
```bash
./gradlew assembleRelease
```

The signed APK will be in: `app/build/outputs/apk/release/app-release.apk`