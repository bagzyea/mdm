# MDM System API Demonstration

## 🔗 Base URL
```
http://localhost:5001/api
```

## 📱 1. Device Management Demo

### Check System Health
```bash
curl http://localhost:5001/health
```

### Enroll a New Device
```bash
curl -X POST http://localhost:5001/api/devices/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEMO-ANDROID-001",
    "manufacturer": "Samsung",
    "model": "Galaxy S21",
    "androidVersion": "14.0",
    "sdkVersion": 34,
    "fingerprint": "samsung/s21/s21:14/UP1A.231105.001/S21ULGS3EWL1:user/release-keys"
  }'
```

### Get All Devices
```bash
curl http://localhost:5001/api/devices
```

### Get Specific Device
```bash
curl http://localhost:5001/api/devices/DEMO-ANDROID-001
```

## 🔐 2. Policy Management Demo

### Create Security Policy
```bash
curl -X POST http://localhost:5001/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Corporate Security Policy",
    "description": "Standard security requirements for corporate devices",
    "type": "SECURITY",
    "rules": {
      "security": {
        "passwordRequired": true,
        "passwordMinLength": 8,
        "passwordComplexity": "complex",
        "passwordExpiry": 90,
        "maxFailedAttempts": 5,
        "lockoutDuration": 15,
        "encryptionRequired": true,
        "screenLockTimeout": 10,
        "biometricAllowed": true,
        "automaticLock": true
      }
    },
    "priority": 10,
    "isActive": true
  }'
```

### Create Application Policy
```bash
curl -X POST http://localhost:5001/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "App Management Policy",
    "description": "Control which apps can be installed and used",
    "type": "APPLICATION",
    "rules": {
      "application": {
        "appWhitelist": ["com.company.workapp", "com.microsoft.office.outlook"],
        "appBlacklist": ["com.facebook.katana", "com.snapchat.android"],
        "allowAppInstallation": false,
        "allowUnknownSources": false,
        "allowAppUninstall": false,
        "kioskMode": {
          "enabled": false,
          "allowedApps": []
        }
      }
    },
    "priority": 5,
    "isActive": true
  }'
```

### Create Network Policy
```bash
curl -X POST http://localhost:5001/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Network Security Policy",
    "description": "Corporate network and connectivity restrictions",
    "type": "NETWORK",
    "rules": {
      "network": {
        "wifiRestrictions": {
          "allowedNetworks": ["CorpWiFi-Secure", "CorpWiFi-Guest"],
          "blockedNetworks": ["FreeWiFi", "Public-Hotspot"],
          "requireCertificate": true,
          "allowPersonalHotspot": false
        },
        "vpnRequired": true,
        "vpnConfiguration": {
          "serverAddress": "vpn.company.com",
          "username": "corporate_user"
        },
        "cellularDataAllowed": true,
        "roamingAllowed": false,
        "bluetoothAllowed": true
      }
    },
    "priority": 8,
    "isActive": true
  }'
```

### Get All Policies
```bash
curl http://localhost:5001/api/policies
```

### Get Policy with Pagination and Filtering
```bash
curl "http://localhost:5001/api/policies?page=1&limit=5&type=SECURITY&isActive=true"
```

## 🎮 3. Remote Commands Demo

### Lock Device
```bash
curl -X POST http://localhost:5001/api/commands \
  -H "Content-Type: application/json" \
  -d '{
    "deviceIds": ["DEVICE_ID_HERE"],
    "command": "LOCK_DEVICE",
    "parameters": {
      "lockMessage": "Device locked by IT administrator",
      "lockPhoneNumber": "+1-555-0123"
    },
    "priority": "HIGH"
  }'
```

### Install Application
```bash
curl -X POST http://localhost:5001/api/commands \
  -H "Content-Type: application/json" \
  -d '{
    "deviceIds": ["DEVICE_ID_HERE"],
    "command": "INSTALL_APP",
    "parameters": {
      "packageName": "com.microsoft.office.outlook",
      "appName": "Microsoft Outlook",
      "appUrl": "https://play.google.com/store/apps/details?id=com.microsoft.office.outlook"
    },
    "priority": "NORMAL"
  }'
```

### Get Device Location
```bash
curl -X POST http://localhost:5001/api/commands \
  -H "Content-Type: application/json" \
  -d '{
    "deviceIds": ["DEVICE_ID_HERE"],
    "command": "LOCATE_DEVICE",
    "parameters": {
      "enableHighAccuracy": true
    },
    "priority": "HIGH"
  }'
```

### Get Device Information
```bash
curl -X POST http://localhost:5001/api/commands \
  -H "Content-Type: application/json" \
  -d '{
    "deviceIds": ["DEVICE_ID_HERE"],
    "command": "GET_DEVICE_INFO",
    "parameters": {},
    "priority": "NORMAL"
  }'
```

### Enable Kiosk Mode
```bash
curl -X POST http://localhost:5001/api/commands \
  -H "Content-Type: application/json" \
  -d '{
    "deviceIds": ["DEVICE_ID_HERE"],
    "command": "SET_KIOSK_MODE",
    "parameters": {
      "allowedApps": ["com.company.kioskapp"],
      "exitCode": "admin123"
    },
    "priority": "HIGH"
  }'
```

### Apply Policy to Device
```bash
curl -X POST http://localhost:5001/api/policies/POLICY_ID_HERE/apply \
  -H "Content-Type: application/json" \
  -d '{
    "deviceIds": ["DEVICE_ID_HERE"]
  }'
```

### Get All Commands
```bash
curl http://localhost:5001/api/commands
```

### Get Commands with Filtering
```bash
curl "http://localhost:5001/api/commands?command=LOCK_DEVICE&status=EXECUTED&page=1&limit=10"
```

### Get Command Statistics
```bash
curl "http://localhost:5001/api/commands/stats?days=7"
```

## 🔄 4. WebSocket Communication Demo

### Connect to WebSocket (JavaScript Example)
```javascript
// Connect to MDM WebSocket server
const socket = io('http://localhost:5001');

// Device identification (simulate device connecting)
socket.emit('deviceIdentify', 'DEMO-ANDROID-001');

// Listen for incoming commands
socket.on('remoteCommand', (commandData) => {
  console.log('Received command:', commandData);
  
  // Simulate command execution
  setTimeout(() => {
    socket.emit('commandResponse', {
      commandId: commandData.commandId,
      deviceId: 'DEMO-ANDROID-001',
      result: {
        success: true,
        message: 'Command executed successfully',
        timestamp: new Date()
      }
    });
  }, 2000);
});

// Send heartbeat every 30 seconds
setInterval(() => {
  socket.emit('deviceHeartbeat', 'DEMO-ANDROID-001');
}, 30000);

// Send status updates
socket.emit('deviceStatusUpdate', {
  deviceId: 'DEMO-ANDROID-001',
  status: 'ACTIVE',
  batteryLevel: 85,
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    accuracy: 10
  },
  networkInfo: {
    wifiEnabled: true,
    connectedWifi: 'CorpWiFi-Secure',
    cellularEnabled: true
  }
});
```

## 📊 5. Advanced Features Demo

### Bulk Command Operations
```bash
# Cancel multiple commands
curl -X POST http://localhost:5001/api/commands/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "cancel",
    "commandIds": ["cmd1", "cmd2", "cmd3"]
  }'
```

### Update Device Status
```bash
curl -X PUT http://localhost:5001/api/devices/DEMO-ANDROID-001/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "ACTIVE",
    "location": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }'
```

## 🎯 Complete Workflow Demo

1. **Enroll Device** → Creates device in system
2. **Create Policies** → Define security/app/network rules  
3. **Apply Policies** → Push policies to specific devices
4. **Send Commands** → Lock, locate, install apps, etc.
5. **Monitor Status** → Real-time device health and location
6. **Review Analytics** → Command success rates and device compliance

## 💡 Key Features Demonstrated

- ✅ **RESTful API** - Complete CRUD operations
- ✅ **Real-time Communication** - WebSocket for instant updates
- ✅ **Policy Management** - Granular device control
- ✅ **Remote Commands** - 20+ command types
- ✅ **Event Logging** - Complete audit trail
- ✅ **Bulk Operations** - Manage multiple devices
- ✅ **Statistics** - Performance and compliance metrics

This MDM system provides enterprise-grade device management capabilities with real-time communication and comprehensive policy enforcement!