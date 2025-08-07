# MDM Project Setup Guide

## Prerequisites

### System Requirements
- **Operating System**: Windows 10/11, macOS, or Linux
- **RAM**: Minimum 8GB (16GB recommended)
- **Storage**: At least 10GB free space
- **Network**: Stable internet connection

### Development Tools
- **Node.js**: Version 18+ ([Download](https://nodejs.org/))
- **Java JDK**: Version 11+ ([Download](https://adoptium.net/))
- **Android Studio**: Latest version ([Download](https://developer.android.com/studio))
- **Git**: Version control ([Download](https://git-scm.com/))
- **Docker**: Containerization ([Download](https://www.docker.com/))
- **PostgreSQL**: Database (via Docker or local installation)

### IDE/Editor
- **Android Studio**: For Android development
- **VS Code**: For backend and web development
- **IntelliJ IDEA**: Alternative for backend development

## Step-by-Step Setup

### 1. Create Project Directory

```bash
# Create main project directory
mkdir mdm-system
cd mdm-system

# Create project structure
mkdir -p android-app backend admin-dashboard integration docs docker scripts
```

### 2. Initialize Backend Project

```bash
# Navigate to backend directory
cd backend

# Initialize Node.js project
npm init -y

# Install dependencies
npm install express prisma @prisma/client cors helmet morgan jsonwebtoken bcryptjs
npm install socket.io redis winston dotenv
npm install -D typescript @types/node @types/express @types/cors @types/morgan
npm install -D @types/jsonwebtoken @types/bcryptjs nodemon ts-node

# Initialize TypeScript
npx tsc --init

# Create source directory structure
mkdir -p src/{controllers,services,models,middleware,routes,utils,types}
mkdir -p prisma tests
```

### 3. Configure TypeScript

```json
// backend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 4. Set Up Database Schema

```prisma
// backend/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Device {
  id              String   @id @default(cuid())
  deviceId        String   @unique
  manufacturer    String
  model           String
  androidVersion  String
  sdkVersion      Int
  fingerprint     String   @unique
  status          DeviceStatus @default(ENROLLED)
  enrolledAt      DateTime @default(now())
  lastSeen        DateTime @default(now())
  location        Json?
  assignedTo      String?
  policies        Policy[]
  commands        RemoteCommand[]
  events          DeviceEvent[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Policy {
  id              String   @id @default(cuid())
  name            String
  description     String
  type            PolicyType
  rules           Json
  targetDevices   String[]
  priority        Int      @default(0)
  isActive        Boolean  @default(true)
  devices         Device[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model RemoteCommand {
  id              String   @id @default(cuid())
  deviceId        String
  command         String
  parameters      Json?
  status          CommandStatus @default(PENDING)
  result          Json?
  device          Device   @relation(fields: [deviceId], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model DeviceEvent {
  id              String   @id @default(cuid())
  deviceId        String
  eventType       String
  eventData       Json?
  device          Device   @relation(fields: [deviceId], references: [id])
  createdAt       DateTime @default(now())
}

enum DeviceStatus {
  ENROLLED
  ACTIVE
  INACTIVE
  SUSPENDED
  WIPED
}

enum PolicyType {
  SECURITY
  NETWORK
  APPLICATION
  COMPLIANCE
}

enum CommandStatus {
  PENDING
  SENT
  EXECUTED
  FAILED
  CANCELLED
}
```

### 5. Environment Configuration

```bash
# backend/.env.example
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mdm_dev"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_EXPIRES_IN="30d"

# Server
PORT=3000
NODE_ENV=development

# Redis
REDIS_URL="redis://localhost:6379"

# AMS Integration
AMS_API_URL="http://localhost:3001/api"
AMS_API_KEY="your-ams-api-key"

# Logging
LOG_LEVEL="info"
```

### 6. Initialize Android Project

```bash
# Navigate to android-app directory
cd ../android-app

# Create Android project using Android Studio or command line
# Minimum SDK: API 30 (Android 11)
# Target SDK: API 34 (Android 14)
```

#### Android Project Configuration

```gradle
// android-app/app/build.gradle
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
    id 'kotlin-kapt'
    id 'kotlin-parcelize'
}

android {
    namespace 'com.mdm.app'
    compileSdk 34

    defaultConfig {
        applicationId "com.mdm.app"
        minSdk 30
        targetSdk 34
        versionCode 1
        versionName "1.0"

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
    
    kotlinOptions {
        jvmTarget = '1.8'
    }
    
    buildFeatures {
        viewBinding true
    }
}

dependencies {
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'androidx.constraintlayout:constraintlayout:2.1.4'
    
    // Networking
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'com.squareup.okhttp3:logging-interceptor:4.12.0'
    
    // Coroutines
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    
    // Lifecycle
    implementation 'androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0'
    implementation 'androidx.lifecycle:lifecycle-livedata-ktx:2.7.0'
    
    // Room Database
    implementation 'androidx.room:room-runtime:2.6.1'
    implementation 'androidx.room:room-ktx:2.6.1'
    kapt 'androidx.room:room-compiler:2.6.1'
    
    // Security
    implementation 'androidx.security:security-crypto:1.1.0-alpha06'
    
    // Testing
    testImplementation 'junit:junit:4.13.2'
    androidTestImplementation 'androidx.test.ext:junit:1.1.5'
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.5.1'
}
```

### 7. Docker Configuration

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  mdm-backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://mdm_user:mdm_password@db:5432/mdm_dev
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./backend:/app
      - /app/node_modules
    depends_on:
      - db
      - redis
    command: npm run dev

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=mdm_dev
      - POSTGRES_USER=mdm_user
      - POSTGRES_PASSWORD=mdm_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 8. Scripts Setup

```json
// backend/package.json scripts
{
  "scripts": {
    "dev": "nodemon src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "db:seed": "ts-node prisma/seed.ts"
  }
}
```

### 9. Git Configuration

```bash
# Initialize Git repository
git init

# Create .gitignore
cat > .gitignore << EOF
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
*.apk
*.aab

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env

# Android
android-app/app/build/
android-app/.gradle/
android-app/local.properties
android-app/.idea/
android-app/*.iml

# iOS
ios/Pods/
ios/build/
ios/DerivedData/
EOF

# Initial commit
git add .
git commit -m "Initial MDM project setup"
```

### 10. Development Workflow

#### Backend Development
```bash
# Start development server
cd backend
npm run dev

# Database operations
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema changes
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

#### Android Development
```bash
# Open Android Studio
# Import android-app directory
# Sync project with Gradle files
# Run on device or emulator
```

#### Docker Development
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop services
docker-compose -f docker-compose.dev.yml down
```

## Next Steps

1. **Verify Setup**: Run tests and ensure all components are working
2. **Database Setup**: Initialize database with Prisma
3. **API Development**: Start implementing core API endpoints
4. **Android App**: Begin Android app development
5. **Integration**: Set up AMS integration layer
6. **Testing**: Implement comprehensive testing strategy

## Troubleshooting

### Common Issues

1. **Node.js Version**: Ensure you're using Node.js 18+
2. **Java Version**: Android development requires Java 11+
3. **Database Connection**: Check DATABASE_URL in .env file
4. **Port Conflicts**: Ensure ports 3000, 5432, 6379 are available
5. **Android SDK**: Install required SDK platforms and tools

### Support

- **Documentation**: Check the main MDM_IMPLEMENTATION_GUIDE.md
- **Issues**: Create GitHub issues for bugs and feature requests
- **Community**: Join development community for support

This setup guide provides a solid foundation for your MDM project. Follow each step carefully and ensure all prerequisites are met before proceeding.
