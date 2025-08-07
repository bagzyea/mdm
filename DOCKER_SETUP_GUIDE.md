# Docker Setup Guide for MDM Development Environment

## 🐳 Complete Docker Installation Guide

### For Windows 10/11

#### Prerequisites
- Windows 10 64-bit: Pro, Enterprise, or Education (Build 19041 or higher)
- Windows 11 64-bit: Home or Pro
- WSL 2 feature enabled
- Hardware virtualization enabled in BIOS

#### Step-by-Step Installation

1. **Enable WSL 2 (Windows Subsystem for Linux)**
   ```powershell
   # Open PowerShell as Administrator and run:
   dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
   dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
   
   # Restart your computer
   ```

2. **Install WSL 2 Linux Kernel Update**
   - Download from: https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi
   - Run the installer

3. **Set WSL 2 as Default**
   ```powershell
   wsl --set-default-version 2
   ```

4. **Download Docker Desktop for Windows**
   - Go to: https://www.docker.com/products/docker-desktop/
   - Click "Download for Windows"
   - Run the installer (Docker Desktop Installer.exe)

5. **Install Docker Desktop**
   - Follow the installation wizard
   - Ensure "Use WSL 2 instead of Hyper-V" is checked
   - Restart when prompted

6. **Verify Installation**
   ```cmd
   docker --version
   docker compose version
   ```

### For macOS

#### Prerequisites
- macOS 10.15 or newer
- Apple chip (M1/M2) or Intel chip

#### Step-by-Step Installation

1. **Download Docker Desktop for Mac**
   - Go to: https://www.docker.com/products/docker-desktop/
   - Choose your chip type:
     - Mac with Intel chip: Download Intel version
     - Mac with Apple chip: Download Apple Silicon version

2. **Install Docker Desktop**
   - Open the downloaded .dmg file
   - Drag Docker.app to Applications folder
   - Double-click Docker.app to start

3. **Grant Permissions**
   - Docker will ask for privileged access to install networking components
   - Enter your password when prompted

4. **Verify Installation**
   ```bash
   docker --version
   docker compose version
   ```

### For Ubuntu/Debian Linux

#### Method 1: Using Docker's Official Repository (Recommended)

1. **Update Package Index**
   ```bash
   sudo apt-get update
   ```

2. **Install Prerequisites**
   ```bash
   sudo apt-get install \
       ca-certificates \
       curl \
       gnupg \
       lsb-release
   ```

3. **Add Docker's Official GPG Key**
   ```bash
   sudo mkdir -p /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   ```

4. **Set Up Repository**
   ```bash
   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   ```

5. **Install Docker Engine**
   ```bash
   sudo apt-get update
   sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

6. **Start Docker Service**
   ```bash
   sudo systemctl start docker
   sudo systemctl enable docker
   ```

7. **Add User to Docker Group (Optional)**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

8. **Verify Installation**
   ```bash
   docker --version
   docker compose version
   ```

#### Method 2: Using Snap (Alternative)

```bash
sudo snap install docker
```

### For CentOS/RHEL/Fedora

1. **Install Docker Engine**
   ```bash
   # For CentOS/RHEL
   sudo yum install -y yum-utils
   sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
   sudo yum install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   
   # For Fedora
   sudo dnf -y install dnf-plugins-core
   sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
   sudo dnf install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

2. **Start Docker**
   ```bash
   sudo systemctl start docker
   sudo systemctl enable docker
   ```

## 🚀 MDM Project Docker Setup

### 1. Navigate to Project Directory
```bash
cd /path/to/your/MDM/project
```

### 2. Start Database Services
```bash
# Start PostgreSQL and Redis
docker compose -f docker-compose.dev.yml up -d db redis
```

### 3. Wait for Services to Start
```bash
# Check if services are running
docker compose -f docker-compose.dev.yml ps

# Check database is ready
docker compose -f docker-compose.dev.yml exec db pg_isready -U mdm_user
```

### 4. Initialize Database
```bash
cd backend
npm run db:push
npm run db:generate
```

### 5. Start Backend Server
```bash
# Option 1: Run locally (recommended for development)
npm run dev

# Option 2: Run in Docker
cd ..
docker compose -f docker-compose.dev.yml up -d --build
```

### 6. Verify Everything Works
```bash
# Test health endpoint
curl http://localhost:5001/health

# Expected response:
# {"status":"healthy","timestamp":"2024-01-15T10:30:00.000Z","environment":"development"}
```

## 🛠️ Useful Docker Commands for MDM Development

### Container Management
```bash
# View running containers
docker compose -f docker-compose.dev.yml ps

# View all containers
docker ps -a

# Stop all services
docker compose -f docker-compose.dev.yml down

# Stop and remove volumes (⚠️ This will delete your data)
docker compose -f docker-compose.dev.yml down -v

# Restart specific service
docker compose -f docker-compose.dev.yml restart db

# View container logs
docker compose -f docker-compose.dev.yml logs db
docker compose -f docker-compose.dev.yml logs redis
docker compose -f docker-compose.dev.yml logs mdm-backend
```

### Database Operations
```bash
# Connect to PostgreSQL database
docker compose -f docker-compose.dev.yml exec db psql -U mdm_user -d mdm_dev

# Create database backup
docker compose -f docker-compose.dev.yml exec db pg_dump -U mdm_user mdm_dev > backup.sql

# Restore database backup
docker compose -f docker-compose.dev.yml exec -T db psql -U mdm_user -d mdm_dev < backup.sql

# Reset database (⚠️ This will delete all data)
docker compose -f docker-compose.dev.yml exec db psql -U mdm_user -d mdm_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cd backend && npm run db:push
```

### Redis Operations
```bash
# Connect to Redis
docker compose -f docker-compose.dev.yml exec redis redis-cli

# View Redis logs
docker compose -f docker-compose.dev.yml logs redis
```

## 🔧 Troubleshooting Common Issues

### Port Already in Use
```bash
# Find what's using port 5432 (PostgreSQL)
sudo lsof -i :5432
# Kill the process
sudo kill -9 <PID>

# Or change port in docker-compose.dev.yml
ports:
  - "5433:5432"  # Use port 5433 instead
```

### Docker Desktop Not Starting (Windows)
1. Ensure WSL 2 is properly installed
2. Check Windows features: "Hyper-V" and "Containers" should be enabled
3. Restart Docker Desktop
4. Check Docker Desktop settings → Resources → WSL Integration

### Permission Denied (Linux)
```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Logout and login again, or run:
newgrp docker
```

### Container Won't Start
```bash
# Check detailed logs
docker compose -f docker-compose.dev.yml logs <service-name>

# Check container status
docker compose -f docker-compose.dev.yml ps

# Rebuild containers
docker compose -f docker-compose.dev.yml up --build --force-recreate
```

### Database Connection Issues
```bash
# Ensure database is ready
docker compose -f docker-compose.dev.yml exec db pg_isready -U mdm_user

# Check connection from backend
cd backend
npm run db:generate
```

## 🎯 Development Workflow

### Daily Development
```bash
# Start your day
docker compose -f docker-compose.dev.yml up -d db redis
cd backend && npm run dev

# Make code changes... 
# (Server auto-restarts with nodemon)

# End of day
docker compose -f docker-compose.dev.yml stop
```

### Database Schema Changes
```bash
# After modifying prisma/schema.prisma
npm run db:push          # Apply changes to database
npm run db:generate      # Regenerate Prisma client
```

### Clean Environment Reset
```bash
# Stop and remove everything
docker compose -f docker-compose.dev.yml down -v

# Start fresh
docker compose -f docker-compose.dev.yml up -d db redis
cd backend && npm run db:push && npm run db:generate && npm run dev
```

## 📊 Monitoring and Debugging

### View Real-time Logs
```bash
# All services
docker compose -f docker-compose.dev.yml logs -f

# Specific service
docker compose -f docker-compose.dev.yml logs -f db
```

### Database GUI Tools
```bash
# Start Prisma Studio (web-based database browser)
cd backend && npm run db:studio
# Open http://localhost:5555
```

### Health Checks
```bash
# Quick health check script
curl -s http://localhost:5001/health | jq '.'
```

## 🚀 Production Deployment Notes

For production deployment, you'll need:
- Separate `docker-compose.prod.yml`
- Environment-specific configurations
- SSL certificates
- Reverse proxy (nginx)
- Monitoring and logging
- Backup strategies

This setup gives you a complete development environment for your MDM system!