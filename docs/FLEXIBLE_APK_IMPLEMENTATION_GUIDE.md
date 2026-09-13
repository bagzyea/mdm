# Flexible APK Selection System - Implementation Guide

This guide provides step-by-step instructions for implementing and integrating the flexible APK selection system into your existing MDM infrastructure.

## Overview

The flexible APK selection system transforms your hardcoded provisioning approach into a dynamic, user-configurable system where administrators can:

- **Select APKs from a centralized registry** instead of hardcoded applications
- **Configure data folders per APK** (especially important for CSentry applications)
- **Choose multiple APKs with custom installation order**
- **Geographic-based data folder filtering** for district/region-specific deployments
- **Real-time compatibility checking** based on device models

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (React/TypeScript)                 │
├─────────────────────────────────────────────────────────────────┤
│  APKSelectionBuilder Component                                  │
│  ├── APK Selection Interface                                    │
│  ├── Data Folder Configuration                                  │
│  ├── Geographic Filtering                                       │
│  └── Installation Order Management                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend API (Node.js)                       │
├─────────────────────────────────────────────────────────────────┤
│  APK Registry Controller                                        │
│  ├── Upload & Register APKs                                     │
│  ├── Data Folder Management                                     │
│  ├── Compatibility Checking                                     │
│  └── Registry CRUD Operations                                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Enhanced Services                            │
├─────────────────────────────────────────────────────────────────┤
│  Enhanced Provisioning Service                                  │
│  ├── Installation Plan Processing                               │
│  ├── Pre/Post Validation                                        │
│  ├── Circuit Breaker Patterns                                   │
│  └── Rollback Capabilities                                      │
│                                                                 │
│  Data Folder Service                                            │
│  ├── Geographic Compatibility                                   │
│  ├── File Integrity Verification                                │
│  ├── Deployment Package Creation                                │
│  └── Storage Management                                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Database (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────────┤
│  APK Registry Tables                                            │
│  ├── APKRegistry (master catalog)                               │
│  ├── APKDataFolder (data associations)                          │
│  ├── Enhanced ProvisioningApp                                   │
│  └── APKUploadSession (bulk operations)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Database Migration

1. **Apply the database migration:**
   ```bash
   cd backend
   npx prisma migrate dev --name add_flexible_apk_system
   ```

2. **Verify the migration was applied:**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

3. **Check the new tables exist:**
   ```sql
   -- Connect to your database and verify:
   \d "APKRegistry"
   \d "APKDataFolder"
   \d "APKUploadSession"
   ```

### Step 2: Backend API Integration

1. **Add the new routes to your main server file:**

   Edit `backend/src/server.ts`:
   ```typescript
   import apkRegistryRoutes from './routes/apkRegistryRoutes';
   
   // Add this with your other routes
   app.use('/api/apk-registry', apkRegistryRoutes);
   ```

2. **Install additional dependencies:**
   ```bash
   cd backend
   npm install multer archiver @types/multer
   ```

3. **Create required directories:**
   ```bash
   mkdir -p uploads/apks
   mkdir -p storage/data_folders
   mkdir -p temp/data_deployment
   ```

4. **Environment variables:**

   Add to your `.env` file:
   ```env
   # APK Storage Configuration
   DATA_STORAGE_PATH=./storage/data_folders
   APK_UPLOAD_PATH=./uploads/apks
   MAX_APK_SIZE=500000000  # 500MB
   
   # Android SDK Path (for APK analysis)
   ANDROID_SDK_PATH=/path/to/android/sdk
   AAPT_PATH=/path/to/android/sdk/build-tools/latest/aapt
   ```

### Step 3: Frontend Integration

1. **Install the APKSelectionBuilder component dependencies:**

   The component is already created at:
   ```
   admin-dashboard/src/components/provisioning/APKSelectionBuilder.tsx
   ```

2. **Update your provisioning workflow:**

   The integration is already done in:
   ```
   admin-dashboard/src/pages/provisioning/ProvisioningProfilesPage.tsx
   ```

3. **Add the new API service methods:**

   Create `admin-dashboard/src/services/apkRegistryService.ts`:
   ```typescript
   import api from './api';
   
   export const apkRegistryService = {
     // Get all APKs with filtering
     getAPKs: async (params?: {
       category?: string;
       search?: string;
       page?: number;
       limit?: number;
     }) => {
       const response = await api.get('/apk-registry', { params });
       return response.data;
     },
   
     // Get compatible APKs for device models
     getCompatibleAPKs: async (deviceModels: string[]) => {
       const response = await api.get('/apk-registry/compatible', {
         params: { deviceModels: deviceModels.join(',') }
       });
       return response.data;
     },
   
     // Upload new APK
     uploadAPK: async (formData: FormData) => {
       const response = await api.post('/apk-registry/upload', formData, {
         headers: { 'Content-Type': 'multipart/form-data' }
       });
       return response.data;
     },
   
     // Add data folder to APK
     addDataFolder: async (apkId: string, folderData: any) => {
       const response = await api.post(`/apk-registry/${apkId}/data-folders`, folderData);
       return response.data;
     }
   };
   ```

### Step 4: Testing the Implementation

1. **Start your development environment:**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend
   cd admin-dashboard
   npm start
   ```

2. **Test APK upload and registration:**
   ```bash
   # Use the admin dashboard or curl to test
   curl -X POST http://localhost:5000/api/apk-registry/upload \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "apk=@/path/to/your/test.apk" \
     -F "displayName=Test Application" \
     -F "category=CENSUS" \
     -F "supportedDeviceModels=[\"Samsung-T225\",\"ZTE\"]"
   ```

3. **Verify the flexible provisioning workflow:**
   - Navigate to Provisioning Profiles page
   - Create a new profile
   - Toggle "Use Flexible APK Selection"
   - Verify APK selection interface appears
   - Select an APK and configure data folders
   - Save and test the profile

### Step 5: Data Migration (Optional)

If you have existing provisioning profiles, you may want to migrate them:

```sql
-- Example migration script for existing data
UPDATE "ProvisioningApp" 
SET "apkId" = (
    SELECT id FROM "APKRegistry" 
    WHERE "packageName" = "ProvisioningApp"."packageName"
    LIMIT 1
)
WHERE "packageName" IS NOT NULL;
```

## Configuration Options

### Geographic Rules Configuration

```typescript
// Example geographic configuration
const geographicConfig = {
  allowedDistricts: ['kampala', 'wakiso', 'mukono'],
  allowedRegions: ['central', 'eastern'],
  dataFolderFiltering: true
};
```

### APK Categories

Available categories in the system:
- `CENSUS` - Census data collection apps
- `PRODUCTIVITY` - Office apps, PDF readers
- `UTILITY` - System utilities, tools
- `COMMUNICATION` - Messaging, email apps
- `MEDIA` - Photo, video apps
- `EDUCATION` - Training, learning apps
- `GOVERNMENT` - Official government apps
- `CUSTOM` - Custom developed apps

### Data Folder Types

Available data folder types:
- `FORMS` - ODK/Census forms
- `DATA` - Pre-populated data
- `CONFIG` - Configuration files
- `ASSETS` - Images, media assets
- `TEMPLATES` - Document templates
- `LOOKUP_TABLES` - Reference data
- `GIS_DATA` - Geographic data
- `CERTIFICATES` - Security certificates

## Usage Examples

### 1. Creating a Census Survey Profile

```typescript
// Example of configuring a CSentry deployment with regional data
const censusProfile = {
  name: "Population Census 2024 - Central Region",
  deviceModels: ["Samsung-T225", "ZTE-A7020"],
  selectedAPKs: [
    {
      apkId: "csentry-app-id",
      selectedDataFolders: [
        "population-forms-id",
        "central-region-lookup-id",
        "enumeration-areas-central-id"
      ],
      installOrder: 1,
      isRequired: true
    }
  ],
  geographicRules: {
    allowedDistricts: ["kampala", "wakiso", "mukono"]
  }
};
```

### 2. Multi-Application Productivity Profile

```typescript
// Example of multiple APK deployment
const productivityProfile = {
  name: "Field Worker Productivity Suite",
  deviceModels: ["Samsung-T225", "Samsung-T295"],
  selectedAPKs: [
    {
      apkId: "csentry-app-id",
      selectedDataFolders: ["basic-forms-id"],
      installOrder: 1,
      isRequired: true
    },
    {
      apkId: "wps-office-id",
      selectedDataFolders: ["templates-id", "samples-id"],
      installOrder: 2,
      isRequired: false
    },
    {
      apkId: "pdf-reader-id",
      selectedDataFolders: [],
      installOrder: 3,
      isRequired: false
    }
  ]
};
```

## Security Considerations

1. **APK Validation:**
   - All uploaded APKs are validated with hash verification
   - Malicious APK detection through signature analysis
   - File size and type restrictions

2. **Data Folder Security:**
   - Path traversal protection
   - Access control for data folder management
   - Encrypted data folder transmission

3. **Geographic Restrictions:**
   - Device location verification before data deployment
   - District/region-based access control
   - Audit logging for compliance

## Performance Optimization

1. **Database Indexing:**
   - Indexes on packageName, category, isActive
   - Composite indexes for efficient filtering
   - Regular VACUUM and ANALYZE operations

2. **File Storage:**
   - Dedicated storage paths for APKs and data folders
   - Cleanup routines for temporary files
   - Storage quota management

3. **API Caching:**
   - APK registry caching for faster lookups
   - Device compatibility caching
   - Geographic data caching

## Troubleshooting

### Common Issues

1. **APK Analysis Fails:**
   ```bash
   # Ensure Android SDK build-tools are installed
   # Check AAPT_PATH environment variable
   which aapt
   ```

2. **Data Folder Deployment Errors:**
   ```bash
   # Check directory permissions
   ls -la storage/data_folders/
   # Verify disk space
   df -h
   ```

3. **Migration Issues:**
   ```sql
   -- Check migration status
   SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC;
   ```

## Next Steps

1. **Enhanced Validation:**
   - Implement APK signature verification
   - Add device compatibility matrix
   - Create automated testing for profiles

2. **Advanced Features:**
   - Bulk APK upload interface
   - APK versioning and update management
   - Automated geographic data assignment

3. **Monitoring:**
   - APK deployment success metrics
   - Data folder usage analytics
   - Performance monitoring dashboards

## Support

For issues or questions about the flexible APK system:

1. Check the implementation logs in `backend/logs/`
2. Verify database connectivity and migrations
3. Ensure all required dependencies are installed
4. Review the API endpoint responses for detailed error messages

The system is designed to be backward compatible, so existing hardcoded provisioning profiles will continue to work while new profiles can use the flexible APK selection system.