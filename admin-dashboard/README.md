# MDM Admin Dashboard

Modern, responsive web-based administration interface for the Mobile Device Management (MDM) system.

## 🚀 Features

- **Authentication & Authorization** - Role-based access control with JWT tokens
- **Real-time Dashboard** - Live device monitoring with WebSocket updates
- **Device Management** - Comprehensive device enrollment and monitoring
- **Policy Management** - Create and manage security, network, and application policies
- **Command Center** - Send remote commands to devices with real-time status
- **User Management** - Admin user creation and role management
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile

## 🛠️ Tech Stack

- **React 18** with TypeScript
- **Material-UI (MUI)** for modern UI components
- **React Query** for efficient data fetching and caching
- **Socket.IO Client** for real-time updates
- **Recharts** for data visualization
- **Vite** for fast development and building
- **React Router** for navigation

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- MDM Backend server running on port 5001

### Setup Steps

1. **Install Dependencies**
   ```bash
   cd admin-dashboard
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```
   The dashboard will be available at http://localhost:5000

3. **Build for Production**
   ```bash
   npm run build
   ```

## 🔐 Authentication

### Default Admin Credentials
- **Username**: `admin`
- **Password**: `Admin123!@#`

⚠️ **Important**: Change the default password after first login!

### User Roles
- **SUPER_ADMIN**: Full system access
- **ADMIN**: User and system management
- **OPERATOR**: Device and policy operations
- **VIEWER**: Read-only access

## 🎯 Usage

### Login
1. Navigate to http://localhost:5000
2. Enter your credentials
3. Access granted based on your role permissions

### Dashboard Overview
- **Device Stats**: Total, active, inactive, suspended devices
- **Policy Status**: Active policies and compliance
- **Command Activity**: Execution statistics and trends
- **System Health**: Real-time system status

### Device Management
- View all enrolled devices
- Monitor device status and location
- Send remote commands
- Apply policies
- Bulk operations

### Policy Management
- Create security, network, application, and compliance policies
- Target devices or device groups
- Monitor policy compliance
- Edit and deactivate policies

### Command Center
- Send commands to individual devices or groups
- Monitor command execution status
- View command history and results
- Bulk command operations

### User Management (Admin Only)
- Create and manage user accounts
- Assign roles and permissions
- Monitor user activity
- Account management

## 🔧 Configuration

### Environment Variables
The dashboard uses Vite's proxy to communicate with the backend API:

```typescript
// vite.config.ts
proxy: {
  '/api': {
    target: 'http://localhost:5001',
    changeOrigin: true,
    secure: false
  }
}
```

### API Configuration
The dashboard automatically connects to:
- **Backend API**: http://localhost:5001/api (proxied to /api)
- **WebSocket**: http://localhost:5001 (for real-time updates)

## 🎨 Customization

### Theme
The dashboard uses Material-UI theming. Customize in `src/App.tsx`:

```typescript
const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
    // ... other colors
  },
  // ... other theme options
});
```

### Layout
- **Sidebar Navigation**: Always visible on desktop, collapsible on mobile
- **Top Bar**: User profile, notifications, system status
- **Main Content**: Responsive grid layout

## 🔄 Real-time Features

The dashboard subscribes to real-time events via WebSocket:
- Device status changes
- Command execution updates
- Policy changes
- System alerts
- User activity

## 📱 Responsive Design

- **Desktop**: Full sidebar navigation with detailed views
- **Tablet**: Collapsible navigation with optimized layouts
- **Mobile**: Bottom navigation with touch-friendly interface

## 🧪 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run type-check   # TypeScript type checking
```

### Project Structure
```
src/
├── components/          # Reusable UI components
│   ├── common/         # Common components (LoadingSpinner, etc.)
│   └── layout/         # Layout components (DashboardLayout, etc.)
├── contexts/           # React contexts (AuthContext, etc.)
├── hooks/              # Custom React hooks
├── pages/              # Page components
│   ├── auth/          # Authentication pages
│   ├── dashboard/     # Dashboard overview
│   ├── devices/       # Device management
│   ├── policies/      # Policy management
│   ├── commands/      # Command center
│   ├── users/         # User management
│   └── settings/      # System settings
├── services/          # API and WebSocket services
├── types/             # TypeScript type definitions
├── utils/             # Utility functions
├── App.tsx           # Main application component
└── main.tsx          # Application entry point
```

### Code Standards
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting and formatting
- **Material-UI**: Consistent component usage
- **React Query**: Data fetching and state management

## 🚀 Production Deployment

### Build
```bash
npm run build
```

### Serve
Serve the `dist` directory with any static file server:
```bash
# Using Node.js serve
npx serve -s dist -l 5000

# Using nginx
# Configure nginx to serve dist/ directory
```

### Environment Configuration
- Update API endpoints in `vite.config.ts`
- Configure HTTPS in production
- Set up proper CORS in backend
- Configure proper WebSocket connections

## 🛡️ Security

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access**: Granular permission system
- **HTTPS**: Enable in production
- **CSP Headers**: Content Security Policy
- **Input Validation**: Client and server-side validation

## 📊 Performance

- **Code Splitting**: Automatic route-based splitting
- **Lazy Loading**: Components loaded on demand
- **Caching**: React Query for efficient data caching
- **Optimization**: Vite's built-in optimizations

## 🤝 Contributing

1. Follow the established code structure
2. Use TypeScript for all new components
3. Follow Material-UI design patterns
4. Add proper error handling
5. Include loading states
6. Test responsiveness

## 📄 License

This project is part of the MDM system and follows the same licensing terms.