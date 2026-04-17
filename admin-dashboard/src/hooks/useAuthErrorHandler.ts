import { useCallback } from 'react';
import { AxiosError } from 'axios';
import logger from '../utils/logger';

/**
 * Custom hook to handle authentication errors in API calls
 * This provides a consistent way to handle 401 errors across the application
 */
export const useAuthErrorHandler = () => {
  
  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      
      // 401 errors are already handled by the API service interceptor
      // but we can provide additional logging or client-specific handling here
      if (status === 401) {
        logger.log('🔐 Authentication error detected - handled by API service');
        return true; // Indicates auth error was handled
      }
      
      // 403 errors indicate insufficient permissions (different from expired token)
      if (status === 403) {
        logger.warn('🚫 Access denied - insufficient permissions');
        return false; // Not an auth expiry error
      }
    }
    
    return false; // Not an auth-related error
  }, []);

  return {
    handleAuthError,
  };
};

export default useAuthErrorHandler;