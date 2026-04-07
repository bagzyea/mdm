import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { User, LoginCredentials, AuthResponse } from '../types';
import { apiService } from '../services/api';
import { websocketService } from '../services/websocket';
import logger from '../utils/logger';

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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Graceful logout function for token expiry
  const handleTokenExpired = useCallback(async () => {
    logger.warn('🔐 Session expired, logging out user gracefully...');
    
    try {
      // Set user to null and clear state
      setUser(null);
      
      // Disconnect websocket
      websocketService.leaveAdminRoom();
      websocketService.disconnect();
      
      // Clear all cached queries
      queryClient.clear();
      
      // Navigate to login page
      navigate('/login', { 
        replace: true,
        state: { 
          message: 'Your session has expired. Please log in again.',
          type: 'info'
        }
      });
      
      logger.log('✅ User logged out due to session expiry');
    } catch (error) {
      logger.error('❌ Error during token expiry logout:', error);
      // Force redirect as fallback
      window.location.href = '/login';
    }
  }, [navigate, queryClient]);

  useEffect(() => {
    // Register token expiry callback with API service
    apiService.setOnTokenExpiredCallback(handleTokenExpired);

    // Check if user is already logged in
    const initAuth = async () => {
      try {
        const token = apiService.getToken();
        if (token) {
          logger.log('🔑 Found existing token, verifying...');

          // Create a timeout promise that rejects after 5 seconds
          const verifyWithTimeout = new Promise<any>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Token verification timeout - backend not responding'));
            }, 5000);

            apiService.getCurrentUser().then(
              (user) => {
                clearTimeout(timeoutId);
                resolve(user);
              },
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              }
            );
          });

          const currentUser = await verifyWithTimeout;
          logger.log('✅ Token verified, user authenticated:', currentUser.username);
          setUser(currentUser);
          // Join admin room for real-time updates
          websocketService.joinAdminRoom();
          // Invalidate all queries to refresh data with authenticated user
          queryClient.invalidateQueries();
        } else {
          logger.log('ℹ️ No token found');
        }
      } catch (error) {
        logger.warn('⚠️ Token verification failed, user will need to login:', (error as Error).message);
        // Token is invalid, expired, or backend is unavailable
        apiService.clearToken();
        setUser(null);
        // Don't clear all queries to preserve cached data
        // queryClient.clear();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [queryClient, handleTokenExpired]);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    // Note: We do NOT set isLoading(true) here - that would show the
    // full-screen spinner and block the login form for 30s on timeout.
    // The LoginPage manages its own local loading state.
    try {
      logger.log('🔐 Attempting login with:', { username: credentials.username });

      const response: AuthResponse = await apiService.login(credentials);
      logger.log('✅ Login successful:', { user: response.user.username, role: response.user.role });

      setUser(response.user);

      // Join admin room for real-time updates
      websocketService.joinAdminRoom();

      // Invalidate all queries to refresh data with new authenticated user
      queryClient.invalidateQueries();
    } catch (error) {
      logger.error('❌ Login failed:', error);
      throw error;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsLoading(true);
      await apiService.logout();
    } catch (error) {
      logger.error('Logout error:', error);
    } finally {
      setUser(null);
      websocketService.leaveAdminRoom();
      websocketService.disconnect();
      // Clear all cached queries on logout
      queryClient.clear();
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

// Export alias for compatibility
export const useAuthContext = useAuth;

export default AuthContext;