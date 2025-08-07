import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, LoginCredentials, AuthResponse } from '@/types';
import { apiService } from '@/services/api';
import { websocketService } from '@/services/websocket';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  hasPermission: (resource: string, action: string) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Role-based permissions (matching backend)
const ROLE_PERMISSIONS: Record<string, Array<{ resource: string; actions: string[] }>> = {
  SUPER_ADMIN: [
    { resource: '*', actions: ['*'] }
  ],
  ADMIN: [
    { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'devices', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'policies', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'commands', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'analytics', actions: ['read'] },
    { resource: 'settings', actions: ['read', 'update'] }
  ],
  OPERATOR: [
    { resource: 'devices', actions: ['read', 'update'] },
    { resource: 'policies', actions: ['read', 'apply'] },
    { resource: 'commands', actions: ['create', 'read'] },
    { resource: 'analytics', actions: ['read'] }
  ],
  VIEWER: [
    { resource: 'devices', actions: ['read'] },
    { resource: 'policies', actions: ['read'] },
    { resource: 'commands', actions: ['read'] },
    { resource: 'analytics', actions: ['read'] }
  ],
  DEVICE: [
    { resource: 'device-self', actions: ['read', 'update'] },
    { resource: 'commands-self', actions: ['read', 'update'] },
    { resource: 'policies-self', actions: ['read'] }
  ]
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const initAuth = async () => {
      try {
        const token = apiService.getToken();
        if (token) {
          const currentUser = await apiService.getCurrentUser();
          setUser(currentUser);
          // Join admin room for real-time updates
          websocketService.joinAdminRoom();
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        apiService.clearToken();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setIsLoading(true);
      const response: AuthResponse = await apiService.login(credentials);
      setUser(response.user);
      
      // Join admin room for real-time updates
      websocketService.joinAdminRoom();
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      websocketService.leaveAdminRoom();
      websocketService.disconnect();
      setIsLoading(false);
    }
  };

  const updateUser = (updates: Partial<User>): void => {
    if (user) {
      setUser({ ...user, ...updates });
    }
  };

  const hasPermission = (resource: string, action: string): boolean => {
    if (!user) return false;

    const rolePermissions = ROLE_PERMISSIONS[user.role];
    if (!rolePermissions) return false;

    // Check for super admin or wildcard permissions
    if (rolePermissions.some(p => p.resource === '*' && p.actions.includes('*'))) {
      return true;
    }

    // Check specific resource permissions
    const resourcePermission = rolePermissions.find(p => p.resource === resource);
    if (!resourcePermission) return false;

    // Check if action is allowed
    return resourcePermission.actions.includes(action) || resourcePermission.actions.includes('*');
  };

  const hasRole = (...roles: string[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const isAuthenticated = !!user;

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    updateUser,
    hasPermission,
    hasRole
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;