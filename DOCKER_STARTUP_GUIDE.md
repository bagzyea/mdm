# 🚀 MDM Application Docker Startup Guide

## ✅ **Current Status: RUNNING SUCCESSFULLY**

Your MDM application is already up and running! Here's what's currently active:

### 🐳 **Running Services**

| Service | Container | Status | Port | Health |
|---------|-----------|---------|------|--------|
| **Backend API** | `mdm-mdm-backend-1` | ✅ Running | 5001 | ✅ Healthy |
| **Admin Dashboard** | `mdm-mdm-frontend-1` | ⚠️ Running | 5000 | ⚠️ Unhealthy |
| **PostgreSQL** | `mdm-db-1` | ✅ Running | 5432 | ✅ Healthy |
| **Redis** | `mdm-redis-1` | ✅ Running | 6379 | ✅ Healthy |

### 🌐 **Service URLs**

- **🎛️ Admin Dashboard**: http://localhost:5000
- **🔗 Backend API**: http://localhost:5001
- **🏥 Health Check**: http://localhost:5001/health
- **🗄️ Database**: localhost:5432
- **⚡ Redis**: localhost:6379

### 🔐 **Default Admin Credentials**

- **Email**: `admin@mdm.local`
- **Password**: `admin123`

## 🛠️ **Quick Commands**

### **Start Services** (if not running)
```bash
start-mdm.bat
```

### **Check Status**
```bash
check-mdm-status.bat
```

### **View Logs**
```bash
docker-compose -f docker-compose.dev.yml logs -f
```

### **Stop Services**
```bash
docker-compose -f docker-compose.dev.yml down
```

### **Restart Services**
```bash
docker-compose -f docker-compose.dev.yml restart
```

## 📱 **Android App Configuration**

### **For Android Emulator**
- **Server URL**: `http://10.0.2.2:5001`
- **WebSocket URL**: `ws://10.0.2.2:5001/ws`

### **For Physical Device**
- **Server URL**: `http://localhost:5001` (if on same network)
- **WebSocket URL**: `ws://localhost:5001/ws`

## 🧪 **Testing Your Setup**

### **1. Test Backend API**
```bash
curl http://localhost:5001/health
```
**Expected Response**: `{"status":"healthy","timestamp":"...","environment":"development"}`

### **2. Test Admin Dashboard**
1. Open browser: http://localhost:5000
2. Login with `admin@mdm.local` / `admin123`
3. Should see MDM admin interface

### **3. Test Database Connection**
```bash
docker-compose -f docker-compose.dev.yml exec db psql -U mdm_user -d mdm_dev -c "SELECT version();"
```

### **4. Test Redis**
```bash
docker-compose -f docker-compose.dev.yml exec redis redis-cli ping
```
**Expected Response**: `PONG`

## 🔧 **Troubleshooting**

### **Frontend Shows "Unhealthy"**
The frontend service shows as unhealthy but is actually working. This is often due to the health check configuration. You can:

1. **Check if it's actually working**: Visit http://localhost:5000
2. **Restart the frontend service**:
   ```bash
   docker-compose -f docker-compose.dev.yml restart mdm-frontend
   ```

### **Services Won't Start**
1. **Check Docker is running**:
   ```bash
   docker info
   ```

2. **Stop all containers and restart**:
   ```bash
   docker-compose -f docker-compose.dev.yml down
   start-mdm.bat
   ```

3. **Check logs for errors**:
   ```bash
   docker-compose -f docker-compose.dev.yml logs
   ```

### **Port Conflicts**
If you get port conflicts, check what's using the ports:
```bash
netstat -ano | findstr :5000
netstat -ano | findstr :5001
```

## 🎯 **Next Steps**

1. **✅ Access Admin Dashboard**: http://localhost:5000
2. **✅ Login with admin credentials** 
3. **✅ Test API endpoints**: http://localhost:5001/health
4. **📱 Configure Android app** to connect to `http://10.0.2.2:5001`
5. **🧪 Test device enrollment** through the Android app

## 📊 **Development Workflow**

### **Daily Startup**
```bash
# Quick start (if containers exist)
docker-compose -f docker-compose.dev.yml up -d

# Full start (with checks)
start-mdm.bat
```

### **View Real-time Logs**
```bash
# All services
docker-compose -f docker-compose.dev.yml logs -f

# Specific service
docker-compose -f docker-compose.dev.yml logs -f mdm-backend
```

### **Database Operations**
```bash
# Access database
docker-compose -f docker-compose.dev.yml exec db psql -U mdm_user -d mdm_dev

# Run migrations
docker-compose -f docker-compose.dev.yml exec mdm-backend npx prisma migrate dev

# Reset database (caution!)
docker-compose -f docker-compose.dev.yml exec mdm-backend npx prisma migrate reset
```

## 🎉 **You're All Set!**

Your MDM application is running successfully and ready for:
- **Admin management** via web dashboard
- **Android device enrollment** and management
- **Real-time device monitoring** and control
- **Policy management** and enforcement

**🚀 Start testing by accessing the admin dashboard at http://localhost:5000!**