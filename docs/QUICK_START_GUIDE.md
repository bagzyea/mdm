# MDM Project Quick Start Guide

## 🚀 Getting Started

This guide will help you get the MDM (Mobile Device Management) system up and running quickly using Docker.

## Prerequisites

- **Docker Desktop** installed and running
- **Git** for cloning the repository
- **Windows PowerShell** or **Git Bash** (for Windows users)

## Quick Setup (Recommended)

### Option 1: Windows Batch Script (Easiest)

1. **Run the setup script:**
   ```bash
   docker-setup.bat
   ```

2. **Wait for completion** - The script will:
   - Check Docker installation
   - Build and start all services
   - Set up the database
   - Create admin user
   - Show service URLs

### Option 2: Manual Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd MDM
   ```

2. **Start the services:**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

3. **Wait for services to be ready** (check with):
   ```bash
   docker-compose -f docker-compose.dev.yml ps
   ```

4. **Set up the database:**
   ```bash
   # Run migrations
   docker-compose -f docker-compose.dev.yml exec mdm-backend npx prisma migrate dev --name init
   
   # Generate Prisma client
   docker-compose -f docker-compose.dev.yml exec mdm-backend npx prisma generate
   
   # Create admin user
   docker-compose -f docker-compose.dev.yml exec mdm-backend npm run create-admin
   ```

## 🎯 Access Your Application

Once setup is complete, you can access:

- **Frontend Dashboard**: http://localhost:5000
- **Backend API**: http://localhost:5001
- **Health Check**: http://localhost:5001/health
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## 🔐 Default Admin Credentials

- **Email**: admin@mdm.local
- **Password**: admin123

## 📁 Project Structure

```
MDM/
├── admin-dashboard/          # React frontend
├── backend/                  # Node.js/Express backend
├── android-app/              # Android device app
├── docker-compose.dev.yml    # Docker services
├── docker-setup.bat         # Windows setup script
└── docker-setup.sh          # Linux/Mac setup script
```

## 🛠️ Development Commands

### Backend Commands
```bash
# View backend logs
docker-compose -f docker-compose.dev.yml logs -f mdm-backend

# Access backend shell
docker-compose -f docker-compose.dev.yml exec mdm-backend sh

# Run database migrations
docker-compose -f docker-compose.dev.yml exec mdm-backend npx prisma migrate dev

# Open Prisma Studio
docker-compose -f docker-compose.dev.yml exec mdm-backend npx prisma studio
```

### Frontend Commands
```bash
# View frontend logs
docker-compose -f docker-compose.dev.yml logs -f mdm-frontend

# Access frontend shell
docker-compose -f docker-compose.dev.yml exec mdm-frontend sh
```

### Database Commands
```bash
# Access PostgreSQL
docker-compose -f docker-compose.dev.yml exec db psql -U mdm_user -d mdm_dev

# Access Redis
docker-compose -f docker-compose.dev.yml exec redis redis-cli
```

## 🐛 Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   # Stop existing containers
   docker-compose -f docker-compose.dev.yml down
   
   # Check what's using the port
   netstat -ano | findstr :5000
   netstat -ano | findstr :5001
   ```

2. **Database connection issues:**
   ```bash
   # Restart database
   docker-compose -f docker-compose.dev.yml restart db
   
   # Check database logs
   docker-compose -f docker-compose.dev.yml logs db
   ```

3. **Frontend not loading:**
   ```bash
   # Check frontend logs
   docker-compose -f docker-compose.dev.yml logs mdm-frontend
   
   # Rebuild frontend
   docker-compose -f docker-compose.dev.yml build --no-cache mdm-frontend
   ```

4. **Backend API errors:**
   ```bash
   # Check backend logs
   docker-compose -f docker-compose.dev.yml logs mdm-backend
   
   # Restart backend
   docker-compose -f docker-compose.dev.yml restart mdm-backend
   ```

### Reset Everything

If you need to start fresh:

```bash
# Stop and remove all containers
docker-compose -f docker-compose.dev.yml down -v

# Remove all images
docker system prune -a

# Start over
docker-setup.bat
```

## 📊 Monitoring

### View Service Status
```bash
docker-compose -f docker-compose.dev.yml ps
```

### View All Logs
```bash
docker-compose -f docker-compose.dev.yml logs -f
```

### Resource Usage
```bash
docker stats
```

## 🔧 Configuration

### Environment Variables

Key environment variables are set in `docker-compose.dev.yml`:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: JWT signing secret
- `CORS_ORIGIN`: Allowed frontend origins
- `ADMIN_EMAIL/PASSWORD`: Default admin credentials

### Customizing Ports

To change ports, edit `docker-compose.dev.yml`:

```yaml
services:
  mdm-frontend:
    ports:
      - "3000:5000"  # Change 3000 to your preferred port
  mdm-backend:
    ports:
      - "8000:5001"  # Change 8000 to your preferred port
```

## 🚀 Production Deployment

For production deployment:

1. Use `docker-compose.prod.yml` (create this file)
2. Set proper environment variables
3. Use proper secrets management
4. Set up SSL/TLS certificates
5. Configure proper logging and monitoring

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the logs: `docker-compose -f docker-compose.dev.yml logs`
3. Ensure Docker Desktop is running
4. Verify all prerequisites are installed

## 🎉 Success!

Once everything is running, you should see:

- ✅ Frontend dashboard at http://localhost:5000
- ✅ Backend API responding at http://localhost:5001/health
- ✅ Database connected and migrations applied
- ✅ Admin user created and ready to login

Happy coding! 🚀
