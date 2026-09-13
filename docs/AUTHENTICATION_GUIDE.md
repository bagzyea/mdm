# MDM Authentication System Guide

## 🔐 Complete JWT Authentication & Authorization System

Your MDM system now includes enterprise-grade security with role-based access control, JWT authentication, and comprehensive audit logging.

## 🚀 Quick Setup & Demo

### 1. Start the System with Docker
```bash
# Start database services
docker compose -f docker-compose.dev.yml up -d db redis

# Initialize database schema
cd backend
npm run db:push
npm run db:generate

# Create the first admin user
npm run create-admin

# Start the backend server
npm run dev
```

### 2. Expected Output from create-admin
```
✅ Admin user created successfully!

📋 Admin User Details:
   👤 Username: admin
   📧 Email: admin@mdm.local
   🔑 Password: Admin123!@#
   🏷️  Role: SUPER_ADMIN
   🆔 User ID: cltxxxxxx

🔐 Security Notes:
   • Please change the default password after first login
   • Consider creating additional admin users and deactivating this account
   • Store these credentials securely
```

## 📱 Authentication API Endpoints

### Base URL
```
http://localhost:5001/api/auth
```

## 🔑 Core Authentication Flow

### 1. Login
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Admin123!@#"
  }'
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "cltxxxxxx",
    "username": "admin",
    "email": "admin@mdm.local",
    "firstName": "System",
    "lastName": "Administrator",
    "role": "SUPER_ADMIN",
    "isActive": true,
    "lastLogin": "2024-01-15T10:30:00.000Z",
    "createdAt": "2024-01-15T09:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h"
}
```

### 2. Use Token for Protected Endpoints
```bash
# Store the token for subsequent requests
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Access protected endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5001/api/devices
```

### 3. Get Current User Profile
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5001/api/auth/profile
```

### 4. Change Password
```bash
curl -X POST http://localhost:5001/api/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Admin123!@#",
    "newPassword": "NewSecurePassword123!@#"
  }'
```

## 👥 User Management (Admin Only)

### Create New User
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "operator1",
    "email": "operator1@company.com",
    "password": "SecurePass123!@#",
    "firstName": "John",
    "lastName": "Operator",
    "role": "OPERATOR"
  }'
```

### Get All Users
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5001/api/auth/users?page=1&limit=10"
```

### Get User by ID
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5001/api/auth/users/USER_ID_HERE
```

### Update User
```bash
curl -X PUT http://localhost:5001/api/auth/users/USER_ID_HERE \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "role": "ADMIN"
  }'
```

## 🛡️ Role-Based Access Control

### User Roles & Permissions

#### SUPER_ADMIN
- Full access to everything
- Can create/modify/delete any resource
- System administration privileges

#### ADMIN
- User management (create, read, update, delete users)
- Device management (full CRUD operations)
- Policy management (full CRUD operations)
- Command management (full CRUD operations)
- Analytics and reporting access
- Settings configuration

#### OPERATOR
- Device management (read, update)
- Policy application (read, apply existing policies)
- Command execution (create, read commands)
- Analytics viewing

#### VIEWER
- Read-only access to devices
- Read-only access to policies
- Read-only access to commands
- Analytics viewing

#### DEVICE
- Limited access for device agents
- Can update own device status
- Can respond to commands
- Can retrieve assigned policies

### Testing Role Permissions

```bash
# Login as different roles and test access
# This will fail if user doesn't have permission
curl -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -X DELETE http://localhost:5001/api/policies/POLICY_ID

# Expected response for insufficient permissions:
{
  "error": "Insufficient permissions",
  "code": "INSUFFICIENT_PERMISSION",
  "required": { "resource": "policies", "action": "delete" },
  "role": "OPERATOR"
}
```

## 🔄 Token Management

### Refresh Token
```bash
curl -X POST http://localhost:5001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "REFRESH_TOKEN_HERE"
  }'
```

### Logout (Revoke Refresh Token)
```bash
curl -X POST http://localhost:5001/api/auth/logout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "REFRESH_TOKEN_HERE"
  }'
```

### Validate Token
```bash
curl -X POST http://localhost:5001/api/auth/validate \
  -H "Authorization: Bearer $TOKEN"
```

## 📊 Audit Logging

### Get User Audit Log
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5001/api/auth/users/USER_ID_HERE/audit-log?limit=50"
```

**Response includes:**
- All user actions (login, policy changes, commands sent)
- IP addresses and user agents
- Timestamps and resource details
- Success/failure status

## 🔐 Security Features

### Rate Limiting
- **SUPER_ADMIN**: 1000 requests per 15 minutes
- **ADMIN**: 500 requests per 15 minutes  
- **OPERATOR**: 200 requests per 15 minutes
- **VIEWER**: 100 requests per 15 minutes
- **DEVICE**: 50 requests per 5 minutes

### Password Requirements
- Minimum 8 characters
- Must contain uppercase letter
- Must contain lowercase letter
- Must contain number
- Must contain special character

### Token Security
- JWT tokens expire in 24 hours
- Refresh tokens expire in 7 days
- Tokens include issuer and audience validation
- Automatic token cleanup for expired/revoked tokens

### Security Headers
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security
- Content-Security-Policy
- Referrer-Policy

## 🚨 Error Codes & Troubleshooting

### Common Error Codes
- `NO_TOKEN`: Authorization header missing
- `INVALID_TOKEN`: JWT token invalid or expired
- `INSUFFICIENT_ROLE`: User role lacks required permissions
- `INSUFFICIENT_PERMISSION`: Specific permission denied
- `RATE_LIMITED`: Too many requests from user/IP
- `LOGIN_FAILED`: Invalid username/password
- `USER_NOT_FOUND`: User doesn't exist
- `REGISTRATION_FAILED`: User creation failed

### Testing Authentication Errors
```bash
# Test without token
curl http://localhost:5001/api/devices
# Expected: {"error":"Access token required","code":"NO_TOKEN"}

# Test with invalid token
curl -H "Authorization: Bearer invalid_token" \
  http://localhost:5001/api/devices
# Expected: {"error":"Invalid or expired token","code":"INVALID_TOKEN"}

# Test insufficient permissions
curl -H "Authorization: Bearer $VIEWER_TOKEN" \
  -X POST http://localhost:5001/api/devices/enroll
# Expected: {"error":"Insufficient permissions","code":"INSUFFICIENT_PERMISSION"}
```

## 🎯 Complete Authentication Workflow

1. **System Setup**
   - Create admin user: `npm run create-admin`
   - Start server: `npm run dev`

2. **Admin Login**
   - POST `/api/auth/login` with admin credentials
   - Store JWT token for subsequent requests

3. **Create Team Users**
   - POST `/api/auth/register` (admin only)
   - Assign appropriate roles (ADMIN, OPERATOR, VIEWER)

4. **Team Member Workflow**
   - Login with assigned credentials
   - Access MDM features based on role permissions
   - Change password on first login

5. **Device Management**
   - Use JWT tokens to access all MDM APIs
   - All actions are logged for audit compliance
   - Role-based permissions ensure proper access control

## 🛠️ Integration Examples

### Frontend Integration (JavaScript)
```javascript
// Login and store token
async function login(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  localStorage.setItem('token', data.token);
  return data.user;
}

// Make authenticated API calls
async function getDevices() {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/devices', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
}
```

### Mobile App Integration (Android/Kotlin)
```kotlin
// Store token securely
class AuthManager {
    private val sharedPrefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
    
    fun saveToken(token: String) {
        sharedPrefs.edit().putString("jwt_token", token).apply()
    }
    
    fun getAuthHeader(): String {
        val token = sharedPrefs.getString("jwt_token", "")
        return "Bearer $token"
    }
}
```

Your MDM system now provides enterprise-grade security with comprehensive authentication, authorization, and audit capabilities!