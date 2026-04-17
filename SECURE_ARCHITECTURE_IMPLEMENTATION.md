# 🔐 Secure MDM Architecture Implementation Guide

## 🏗️ **New Architecture Overview**

### **Command Flow: Dashboard → Server → Device**
```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Admin clicks   │────▶│  Server creates  │────▶│ Device executes  │
│ "Enable Kiosk"   │     │ command & queues │     │ command received │
│   on Dashboard   │     │   via WebSocket  │     │  via WebSocket   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

## 📊 **Database Schema - Command Queue System**

### **New Tables Required:**

```sql
-- Device Commands Table
CREATE TABLE device_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id),
    command_type VARCHAR(50) NOT NULL,
    command_payload JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    executed_at TIMESTAMP,
    result JSONB,
    error_message TEXT,
    
    INDEX idx_device_commands_device_status (device_id, status),
    INDEX idx_device_commands_created_at (created_at)
);

-- Command Types
-- 'enable_kiosk', 'disable_kiosk', 'lock_device', 'restart_services', 
-- 'install_app', 'uninstall_app', 'update_policies', 'wipe_device'

-- Command Audit Log
CREATE TABLE command_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id UUID REFERENCES device_commands(id),
    device_id UUID NOT NULL,
    admin_user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔧 **Backend Implementation**

### **1. Command Queue Service**

```typescript
// backend/src/services/commandQueueService.ts
export class CommandQueueService {
    
    async createCommand(deviceId: string, commandType: string, payload: any, adminUserId: string) {
        const command = await prisma.deviceCommand.create({
            data: {
                deviceId,
                commandType,
                commandPayload: payload,
                createdBy: adminUserId,
                status: 'pending'
            }
        });
        
        // Send via WebSocket immediately if device is connected
        await this.sendCommandToDevice(deviceId, command);
        
        // Log audit trail
        await this.logCommandAction(command.id, adminUserId, 'created');
        
        return command;
    }
    
    async sendCommandToDevice(deviceId: string, command: any) {
        const webSocketManager = WebSocketManager.getInstance();
        const deviceSocket = webSocketManager.getDeviceSocket(deviceId);
        
        if (deviceSocket) {
            deviceSocket.send(JSON.stringify({
                type: 'command',
                commandId: command.id,
                commandType: command.commandType,
                payload: command.commandPayload,
                timestamp: new Date().toISOString()
            }));
            
            // Update status to 'sent'
            await prisma.deviceCommand.update({
                where: { id: command.id },
                data: { status: 'sent' }
            });
        }
    }
    
    async handleCommandResult(commandId: string, success: boolean, result?: any, error?: string) {
        await prisma.deviceCommand.update({
            where: { id: commandId },
            data: {
                status: success ? 'completed' : 'failed',
                executedAt: new Date(),
                result: result,
                errorMessage: error
            }
        });
        
        await this.logCommandAction(commandId, null, success ? 'completed' : 'failed');
    }
}
```

### **2. API Endpoints for Dashboard**

```typescript
// backend/src/controllers/deviceCommandController.ts
export class DeviceCommandController {
    
    // POST /api/devices/:deviceId/commands/enable-kiosk
    async enableKioskMode(req: Request, res: Response) {
        const { deviceId } = req.params;
        const adminUserId = req.user.id;
        
        try {
            const command = await commandQueueService.createCommand(
                deviceId,
                'enable_kiosk',
                { 
                    allowedPackages: [req.body.allowedPackage || 'com.mdm.app'],
                    timeoutMinutes: req.body.timeoutMinutes || 0 
                },
                adminUserId
            );
            
            res.json({ success: true, commandId: command.id });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create kiosk command' });
        }
    }
    
    // POST /api/devices/:deviceId/commands/disable-kiosk  
    async disableKioskMode(req: Request, res: Response) {
        const { deviceId } = req.params;
        const adminUserId = req.user.id;
        
        const command = await commandQueueService.createCommand(
            deviceId,
            'disable_kiosk',
            {},
            adminUserId
        );
        
        res.json({ success: true, commandId: command.id });
    }
    
    // POST /api/devices/:deviceId/commands/lock-device
    async lockDevice(req: Request, res: Response) {
        const { deviceId } = req.params;
        const adminUserId = req.user.id;
        
        const command = await commandQueueService.createCommand(
            deviceId,
            'lock_device',
            { message: req.body.message || 'Device locked by administrator' },
            adminUserId
        );
        
        res.json({ success: true, commandId: command.id });
    }
    
    // GET /api/devices/:deviceId/commands
    async getDeviceCommands(req: Request, res: Response) {
        const { deviceId } = req.params;
        const { status, limit = 50 } = req.query;
        
        const commands = await prisma.deviceCommand.findMany({
            where: { 
                deviceId,
                ...(status && { status: status as string })
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit as string),
            include: {
                createdBy: { select: { email: true, firstName: true, lastName: true } }
            }
        });
        
        res.json(commands);
    }
}
```

### **3. WebSocket Command Handling**

```typescript
// backend/src/websocket/deviceWebSocketHandler.ts
export class DeviceWebSocketHandler {
    
    handleCommandResult(ws: WebSocket, data: any) {
        const { commandId, success, result, error } = data;
        
        commandQueueService.handleCommandResult(
            commandId,
            success,
            result,
            error
        );
        
        // Notify dashboard in real-time
        this.notifyDashboard(data.deviceId, 'command_completed', {
            commandId,
            success,
            result
        });
    }
    
    async sendPendingCommands(deviceId: string) {
        const pendingCommands = await prisma.deviceCommand.findMany({
            where: { 
                deviceId, 
                status: { in: ['pending', 'sent'] }
            },
            orderBy: { createdAt: 'asc' }
        });
        
        for (const command of pendingCommands) {
            await commandQueueService.sendCommandToDevice(deviceId, command);
        }
    }
}
```

## 🎛️ **Dashboard Implementation**

### **1. Device Management Interface**

```typescript
// admin-dashboard/src/components/DeviceManagement.tsx
export const DeviceManagementPage: React.FC = () => {
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);
    
    const enableKioskMode = async (deviceId: string) => {
        const confirmResult = await Swal.fire({
            title: 'Enable Kiosk Mode?',
            text: 'This will lock the device to the MDM app only.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, Enable Kiosk Mode',
            cancelButtonText: 'Cancel'
        });
        
        if (confirmResult.isConfirmed) {
            try {
                await api.post(`/devices/${deviceId}/commands/enable-kiosk`);
                toast.success('Kiosk mode command sent to device');
                refreshDeviceStatus(deviceId);
            } catch (error) {
                toast.error('Failed to send kiosk mode command');
            }
        }
    };
    
    const lockDevice = async (deviceId: string) => {
        const { value: message } = await Swal.fire({
            title: 'Lock Device',
            input: 'textarea',
            inputLabel: 'Lock message (optional)',
            inputPlaceholder: 'Enter a message to display on the locked device...',
            showCancelButton: true,
            confirmButtonText: 'Lock Device',
            cancelButtonText: 'Cancel'
        });
        
        if (message !== undefined) {
            try {
                await api.post(`/devices/${deviceId}/commands/lock-device`, { message });
                toast.success('Device lock command sent');
            } catch (error) {
                toast.error('Failed to send lock command');
            }
        }
    };
    
    return (
        <div className="device-management">
            <div className="device-list">
                {devices.map(device => (
                    <div key={device.id} className="device-card">
                        <div className="device-info">
                            <h3>{device.name}</h3>
                            <span className={`status ${device.status}`}>
                                {device.status}
                            </span>
                        </div>
                        
                        <div className="device-actions">
                            <button 
                                onClick={() => enableKioskMode(device.id)}
                                className="btn btn-warning"
                                disabled={device.kioskMode}
                            >
                                {device.kioskMode ? 'Kiosk Active' : 'Enable Kiosk'}
                            </button>
                            
                            <button 
                                onClick={() => disableKioskMode(device.id)}
                                className="btn btn-secondary"
                                disabled={!device.kioskMode}
                            >
                                Disable Kiosk
                            </button>
                            
                            <button 
                                onClick={() => lockDevice(device.id)}
                                className="btn btn-danger"
                            >
                                Lock Device
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
```

## 📱 **Updated Android App - Command Receiver Only**

### **1. Remove Dangerous UI Elements**

```xml
<!-- Remove these from activity_main.xml -->
<!-- REMOVE: Enable/Disable Kiosk buttons -->
<!-- REMOVE: Lock Device button -->
<!-- REMOVE: Start/Stop Services buttons -->

<!-- Keep only safe elements -->
<com.google.android.material.button.MaterialButton
    android:id="@+id/refreshStatusButton"
    android:text="Refresh Status" />
    
<com.google.android.material.button.MaterialButton
    android:id="@+id/getDeviceInfoButton"
    android:text="Device Information" />
    
<com.google.android.material.button.MaterialButton
    android:id="@+id/viewPoliciesButton"
    android:text="View Policies" />
```

### **2. Updated MainActivity - Command Receiver**

```kotlin
// Remove dangerous button listeners, keep only safe ones
private fun setupButtonListeners() {
    // SAFE: Status and information
    refreshStatusButton.setOnClickListener { refreshDeviceStatus() }
    getDeviceInfoButton.setOnClickListener { getDeviceInfo() }
    viewPoliciesButton.setOnClickListener { viewPolicies() }
    
    // SAFE: Essential MDM functions  
    checkPendingCommandsButton.setOnClickListener { checkPendingCommands() }
    updatePoliciesButton.setOnClickListener { updatePolicies() }
    appInventoryButton.setOnClickListener { getAppInventory() }
    
    // SAFE: Initial setup only
    enableAdminButton.setOnClickListener { enableDeviceAdmin() }
    enrollButton.setOnClickListener { enrollDevice() }
    
    // REMOVED: All dangerous functions
    // - enableKiosk()
    // - disableKiosk() 
    // - lockDevice()
    // - startMDMServices()
    // - stopMDMServices()
}

// Add server command handler
private fun handleServerCommand(command: JSONObject) {
    val commandType = command.getString("commandType")
    val commandId = command.getString("commandId")
    val payload = command.optJSONObject("payload")
    
    lifecycleScope.launch {
        try {
            when (commandType) {
                "enable_kiosk" -> executeEnableKiosk(payload)
                "disable_kiosk" -> executeDisableKiosk()
                "lock_device" -> executeLockDevice(payload)
                "restart_services" -> executeRestartServices()
                else -> {
                    Log.w(TAG, "Unknown command type: $commandType")
                    sendCommandResult(commandId, false, null, "Unknown command")
                    return@launch
                }
            }
            
            sendCommandResult(commandId, true, mapOf("executed" to true))
            
        } catch (e: Exception) {
            Log.e(TAG, "Command execution failed", e)
            sendCommandResult(commandId, false, null, e.message)
        }
    }
}

// Server-initiated kiosk mode (not user-initiated)
private suspend fun executeEnableKiosk(payload: JSONObject?) {
    if (devicePolicyManager.isAdminActive(deviceAdminComponent)) {
        val allowedPackages = payload?.optJSONArray("allowedPackages")?.let { 
            (0 until it.length()).map { i -> it.getString(i) }.toTypedArray()
        } ?: arrayOf(packageName)
        
        devicePolicyManager.setLockTaskPackages(deviceAdminComponent, allowedPackages)
        startLockTask()
        
        preferenceManager.setKioskModeEnabled(true)
        updateStatus("Kiosk mode enabled by administrator", StatusType.INFO)
    } else {
        throw Exception("Device admin not active")
    }
}
```

## 🛡️ **Security Improvements Summary**

### **What We Achieve:**

1. **✅ Prevents Accidental Lockouts**: Users cannot accidentally enable kiosk mode
2. **✅ Centralized Control**: All dangerous operations managed from dashboard  
3. **✅ Audit Trail**: Complete command history and logging
4. **✅ Role-Based Access**: Only authorized admins can send commands
5. **✅ Emergency Recovery**: Dashboard always has override capabilities
6. **✅ Consistent Management**: All devices managed the same way

### **Risk Mitigation:**

- **Before**: Users could lock themselves out of devices
- **After**: Only authorized admins can initiate lock/kiosk commands
- **Emergency**: Dashboard retains full control for recovery

## 🚀 **Implementation Priority**

### **Phase 1: Immediate (High Priority)**
1. Remove dangerous buttons from Android app
2. Update MainActivity to handle only server commands  
3. Test command reception still works

### **Phase 2: Backend (Medium Priority)**
1. Implement command queue database tables
2. Create command API endpoints
3. Add WebSocket command delivery

### **Phase 3: Dashboard (Medium Priority)**  
1. Build device management interface
2. Add remote control buttons
3. Implement command history view

Would you like me to start implementing these changes, beginning with securing the Android app?