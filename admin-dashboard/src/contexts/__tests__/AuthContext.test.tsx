import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../AuthContext';
import * as apiService from '../../services/api';

// Mock the API service
vi.mock('../../services/api', () => ({
  apiService: {
    login: vi.fn(),
    logout: vi.fn(),
    validateToken: vi.fn(),
  },
}));

// Mock websocket service
vi.mock('../../services/websocket', () => ({
  websocketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const createWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  </BrowserRouter>
);

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should provide initial authentication state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('should handle successful login', async () => {
    const mockUser = {
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'USER' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    };

    vi.mocked(apiService.apiService.login).mockResolvedValue({
      user: mockUser,
      tokens: mockTokens,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper });

    await act(async () => {
      await result.current.login({
        username: 'testuser',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    // Check that tokens are stored
    expect(localStorage.getItem('accessToken')).toBe('access-token');
    expect(localStorage.getItem('refreshToken')).toBe('refresh-token');
  });

  it('should handle login failure', async () => {
    const loginError = new Error('Invalid credentials');
    vi.mocked(apiService.apiService.login).mockRejectedValue(loginError);

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper });

    await act(async () => {
      try {
        await result.current.login({
          username: 'testuser',
          password: 'wrongpassword',
        });
      } catch (error) {
        expect(error).toBe(loginError);
      }
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should handle logout', async () => {
    // First login
    const mockUser = {
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'USER' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(apiService.apiService.login).mockResolvedValue({
      user: mockUser,
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper });

    await act(async () => {
      await result.current.login({
        username: 'testuser',
        password: 'password123',
      });
    });

    // Now logout
    vi.mocked(apiService.apiService.logout).mockResolvedValue(undefined);

    await act(async () => {
      await result.current.logout();
    });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    // Check that tokens are cleared
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('should restore authentication state from localStorage', async () => {
    const mockUser = {
      id: '1',
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'USER' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Set up localStorage with existing tokens
    localStorage.setItem('accessToken', 'existing-token');
    localStorage.setItem('refreshToken', 'existing-refresh-token');

    vi.mocked(apiService.apiService.validateToken).mockResolvedValue({
      valid: true,
      user: mockUser,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper });

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });
  });
});